import {invoke} from "@tauri-apps/api/core";

export interface VoiceSettings {
	micDeviceId: string;
	speakerDeviceId: string;
	micVolume: number;
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
	private muted = false;
	private active = false;
	private playbackContext: AudioContext | null = null;

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

		const processor = this.audioContext.createScriptProcessor(2048, 1, 1);
		processor.onaudioprocess = (e) => {
			if (this.muted || !this.active) return;
			const input = e.inputBuffer.getChannelData(0);
			const pcm = new Int16Array(input.length);
			for (let i = 0; i < input.length; i++) {
				const s = Math.max(-1, Math.min(1, input[i]));
				pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
			}
			const bytes = new Uint8Array(pcm.buffer);
			invoke("send_voice_data", {data: Array.from(bytes)});
		};

		this.source.connect(this.gainNode);
		this.gainNode.connect(processor);
		processor.connect(this.audioContext.destination);
		this.processor = processor;

		this.playbackContext = new AudioContext({sampleRate: 48000});

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
		this.playbackContext = null;
	}

	setMuted(muted: boolean): void {
		this.muted = muted;
	}

	setMicVolume(volume: number): void {
		if (this.gainNode) {
			this.gainNode.gain.value = volume / 100;
		}
	}

	isActive(): boolean {
		return this.active;
	}

	isMuted(): boolean {
		return this.muted;
	}

	playAudioData(data: number[]): void {
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
		src.connect(this.playbackContext.destination);
		src.start();
	}
}

export const voiceManager = new VoiceManager();