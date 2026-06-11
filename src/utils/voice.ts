// Voice Chat Stream Manager over standard browser WebSockets
export class VoiceChatManager {
  private socket: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private activePlayersPlayback: Record<string, number> = {}; // for visual indicator timers

  constructor(socket: WebSocket | null) {
    this.socket = socket;
  }

  updateSocket(socket: WebSocket | null) {
    this.socket = socket;
  }

  // Request microphone input and begin recording / sending chunks
  async startRecording(onChunkSent: () => void, onError: (e: any) => void) {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = this.audioCtx.createMediaStreamSource(this.micStream);
      
      // Use standard ScriptProcessorNode for legacy browser compatibility inside iframe
      this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1);
      
      source.connect(this.processor);
      this.processor.connect(this.audioCtx.destination);

      this.processor.onaudioprocess = (e) => {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

        const inputBuffer = e.inputBuffer;
        const channelData = inputBuffer.getChannelData(0);

        // Compress or convert Float32 array to simple 16-bit Int16 array to optimize packet bandwidth
        const int16Buffer = new Int16Array(channelData.length);
        for (let i = 0; i < channelData.length; i++) {
          int16Buffer[i] = Math.min(1, Math.max(-1, channelData[i])) * 0x7FFF;
        }

        // Convert Int16 buffer data to a base64 encoded string
        const binaryString = String.fromCharCode.apply(null, Array.from(new Uint16Array(int16Buffer.buffer)));
        const base64Audio = btoa(binaryString);

        // Notify socket thread
        this.socket.send(JSON.stringify({
          type: "game:voice_chunk",
          payload: { audioData: base64Audio }
        }));
        onChunkSent();
      };
    } catch (e) {
      console.warn("Could not capture mic or setup voice streaming context", e);
      onError(e);
    }
  }

  // Stop capturing microphone and clean up nodes
  stopRecording() {
    try {
      if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
      }
      if (this.micStream) {
        this.micStream.getTracks().forEach(track => track.stop());
        this.micStream = null;
      }
      if (this.audioCtx) {
        this.audioCtx.close();
        this.audioCtx = null;
      }
    } catch (e) {
      console.error("Cleanup voice recording failed", e);
    }
  }

  // Playback an incoming base64 chunk from another player
  playIncomingChunk(fromUser: string, base64Audio: string) {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      // Convert Base64 back to Uint8/Int16 buffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);

      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 0x7FFF;
      }

      // Reconstruct buffer source
      const audioBuffer = this.audioCtx.createBuffer(1, float32Array.length, this.audioCtx.sampleRate || 44100);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioCtx.destination);
      source.start();

      // Track player active speaking indicator
      this.activePlayersPlayback[fromUser] = Date.now();
    } catch (e) {
      // Audio playback protect
    }
  }

  isUserSpeaking(fromUser: string): boolean {
    const lastActive = this.activePlayersPlayback[fromUser];
    if (!lastActive) return false;
    return Date.now() - lastActive < 1000; // active within 1 sec
  }
}
