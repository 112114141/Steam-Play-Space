import {invoke} from "@tauri-apps/api/core";

export interface VoiceSettings {
	micDeviceId: string;
	speakerDeviceId: string;
	micVolume: number;
	speakerVolume: number;
	noiseSuppression: boolean;
	echoCancellation: boolean;
	autoGainControl: boolean;
}

export class VoiceManager {
	private audioContext: AudioContext | null = null;
	private mediaStream: MediaStream | null = null;
	private processor: ScriptProcessorNode | null = null;
	private source: MediaStreamAudioSourceNode | null = null;
	private gainNode: GainNode | null = null;
	private speakerGainNode: GainNode | null = null;
	private muted = false;
	private active = false;
	private playbackContext: AudioContext | null = null;
	private nextPlayTime = 0;
	private onSpeakingCallback?: (speaking: boolean) => void;
	private lastSpeaking = false;

	private jitterBuffer: Map<number, number[]> = new Map();
	private nextSeq: number = -1;
	private readonly JITTER_TARGET = 10;
	private readonly JITTER_MAX = 30;

	async start(settings: VoiceSettings): Promise<void> {
		this.mediaStream = await navigator.mediaDevices.getUserMedia({
			audio: {
				deviceId: settings.micDeviceId ? {exact: settings.micDeviceId} : undefined,
				echoCancellation: settings.echoCancellation,
				noiseSuppression: settings.noiseSuppression,
				autoGainControl: settings.autoGainControl,
			},
		});

		this.audioContext = new AudioContext({sampleRate: 48000});
		this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

		this.gainNode = this.audioContext.createGain();
		this.gainNode.gain.value = settings.micVolume / 100;

		const processor = this.audioContext.createScriptProcessor(512, 1, 1);
		processor.onaudioprocess = (e) => {
			if (this.muted || !this.active) return;
			const input = e.inputBuffer.getChannelData(0);

			let rms = 0;
			for (let i = 0; i < input.length; i++) {
				rms += input[i] * input[i];
			}
			rms = Math.sqrt(rms / input.length);
			const speaking = rms > 0.01;
			if (speaking !== this.lastSpeaking) {
				this.lastSpeaking = speaking;
				if (this.onSpeakingCallback) this.onSpeakingCallback(speaking);
			}

			const pcm = new Int16Array(input.length);
			for (let i = 0; i < input.length; i++) {
				const s = Math.max(-1, Math.min(1, input[i]));
				pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
			}
			const bytes = new Uint8Array(pcm.buffer);
			invoke("send_voice_data", {data: Array.from(bytes)});
		};

		const silentGain = this.audioContext.createGain();
		silentGain.gain.value = 0;
		this.source.connect(this.gainNode);
		this.gainNode.connect(processor);
		processor.connect(silentGain);
		silentGain.connect(this.audioContext.destination);
		this.processor = processor;

		this.playbackContext = new AudioContext({sampleRate: 48000});
		this.speakerGainNode = this.playbackContext.createGain();
		this.speakerGainNode.gain.value = settings.speakerVolume / 100;
		this.nextPlayTime = 0;

		if (settings.speakerDeviceId) {
			const dest = this.playbackContext.destination as any;
			if (typeof dest.setSinkId === "function") {
				try {
					await dest.setSinkId(settings.speakerDeviceId);
				} catch {}
			}
		}

		this.active = true;
	}

	stop(): void {
		this.active = false;
		try {
			this.processor?.disconnect();
			this.gainNode?.disconnect();
			this.source?.disconnect();
			this.audioContext?.close();
			this.mediaStream?.getTracks().forEach((t) => t.stop());
			this.playbackContext?.close();
		} catch {}
		this.audioContext = null;
		this.mediaStream = null;
		this.processor = null;
		this.source = null;
		this.gainNode = null;
		this.speakerGainNode = null;
		this.playbackContext = null;
		this.nextPlayTime = 0;

		this.jitterBuffer.clear();
		this.nextSeq = -1;
	}

	setMuted(muted: boolean): void {
		this.muted = muted;
	}

	resetJitterBuffer(): void {
		this.jitterBuffer.clear();
		this.nextSeq = -1;
		this.nextPlayTime = 0;
	}

	setMicVolume(volume: number): void {
		if (this.gainNode) {
			this.gainNode.gain.value = volume / 100;
		}
	}

	setSpeakerVolume(volume: number): void {
		if (this.speakerGainNode) {
			this.speakerGainNode.gain.value = volume / 100;
		}
	}

	setOnSpeaking(callback?: (speaking: boolean) => void): void {
		this.onSpeakingCallback = callback;
	}

	isActive(): boolean {
		return this.active;
	}

	isMuted(): boolean {
		return this.muted;
	}

	playAudioData(data: number[]): void {
		if (!this.playbackContext || !this.active) return;
		if (data.length < 4) return;

		const view = new DataView(new Uint8Array(data).buffer);
		const seq = view.getUint32(0, true);
		const audioData = data.slice(4);

		if (this.nextSeq !== -1 && seq < this.nextSeq) return;

		this.jitterBuffer.set(seq, audioData);

		if (this.jitterBuffer.size > this.JITTER_MAX) {
			const minSeq = Math.min(...this.jitterBuffer.keys());
			this.nextSeq = minSeq;
		}

		this.playFromBuffer();
	}

	private playFromBuffer(): void {
		if (this.nextSeq === -1) {
			if (this.jitterBuffer.size < this.JITTER_TARGET) return;
			this.nextSeq = Math.min(...this.jitterBuffer.keys());
		}

		let iterations = 0;
		while (iterations < 20) {
			iterations++;
			if (this.jitterBuffer.has(this.nextSeq)) {
				const audioData = this.jitterBuffer.get(this.nextSeq)!;
				this.jitterBuffer.delete(this.nextSeq);
				this.playPcm(audioData);
				this.nextSeq = (this.nextSeq + 1) >>> 0;
			} else if (this.jitterBuffer.size > 0) {
				const minKey = Math.min(...this.jitterBuffer.keys());
				if (minKey > this.nextSeq) {
					this.nextSeq = minKey;
				} else {
					break;
				}
			} else {
				break;
			}
		}
	}

	private playPcm(data: number[]): void {
		if (!this.playbackContext || !this.active) return;

		const uint8 = new Uint8Array(data);
		const samples = Math.floor(uint8.length / 2);
		if (samples === 0) return;

		const buffer = this.playbackContext.createBuffer(1, samples, 48000);
		const channelData = buffer.getChannelData(0);
		const view = new DataView(uint8.buffer);
		for (let i = 0; i < samples; i++) {
			channelData[i] = view.getInt16(i * 2, true) / 32768;
		}

		const src = this.playbackContext.createBufferSource();
		src.buffer = buffer;
		if (this.speakerGainNode) {
			src.connect(this.speakerGainNode);
			this.speakerGainNode.connect(this.playbackContext.destination);
		} else {
			src.connect(this.playbackContext.destination);
		}

		const now = this.playbackContext.currentTime;
		if (this.nextPlayTime < now || this.nextPlayTime > now + 0.05) {
			this.nextPlayTime = now + 0.01;
		}
		src.start(this.nextPlayTime);
		this.nextPlayTime += buffer.duration;
	}

}

export const voiceManager = new VoiceManager();