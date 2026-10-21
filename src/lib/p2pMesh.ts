/**
 * GateFlow Peer-to-Peer (P2P) Offline Mesh Synchronization
 * 
 * Provides local synchronization between check-in stations (Gate A, B, C, D)
 * even during a complete venue internet blackout.
 * 
 * 1. BroadcastChannel: Instant cross-tab/local-window sync on the same origin.
 * 2. WebRTC DataChannels: Direct peer-to-peer over local Wi-Fi / hotspot / Bluetooth PAN
 *    without requiring an external signaling server.
 * 3. Local Mesh Invariant Cache: Detects and rejects duplicate check-ins across gates
 *    even when completely offline.
 */

export interface MeshCheckInEvent {
  type: "MESH_CHECKIN";
  id: string;
  payload: string;
  requestId: string;
  participantId?: string;
  participantName?: string;
  stationName: string;
  timestamp: string;
}

export interface MeshPeerState {
  peerId: string;
  connected: boolean;
  stationName?: string;
  lastPing: number;
}

const MESH_CHANNEL_NAME = "gateflow-local-mesh-v1";
const MESH_CACHE_KEY = "gateflow-p2p-checkin-cache";

// In-memory registry of locally known check-ins
function getMeshCheckInCache(): Record<string, MeshCheckInEvent> {
  try {
    return JSON.parse(localStorage.getItem(MESH_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveMeshCheckIn(event: MeshCheckInEvent): void {
  try {
    const cache = getMeshCheckInCache();
    cache[event.payload] = event;
    if (event.participantId) {
      cache[event.participantId] = event;
    }
    // Retain up to 1000 items
    const keys = Object.keys(cache);
    if (keys.length > 1000) {
      const trimmed: Record<string, MeshCheckInEvent> = {};
      keys.slice(-800).forEach((k) => { trimmed[k] = cache[k]; });
      localStorage.setItem(MESH_CACHE_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(MESH_CACHE_KEY, JSON.stringify(cache));
    }
  } catch {
    // Ignore storage issues
  }
}

class P2PMeshEngine {
  private broadcastChannel: BroadcastChannel | null = null;
  private activeConnections: Map<string, { pc: RTCPeerConnection; channel: RTCDataChannel; station?: string }> = new Map();
  private listeners: Set<(event: MeshCheckInEvent) => void> = new Set();
  private statusListeners: Set<(count: number) => void> = new Set();
  public localStationName: string = "A";

  constructor() {
    this.initBroadcastChannel();
  }

  private initBroadcastChannel() {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        this.broadcastChannel = new BroadcastChannel(MESH_CHANNEL_NAME);
        this.broadcastChannel.onmessage = (event) => {
          if (event.data && event.data.type === "MESH_CHECKIN") {
            this.handleIncomingCheckIn(event.data);
          }
        };
      } catch (err) {
        console.warn("BroadcastChannel not supported in current environment", err);
      }
    }
  }

  public setStation(station: string) {
    this.localStationName = station;
  }

  public subscribe(callback: (event: MeshCheckInEvent) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public onPeerCountChange(callback: (count: number) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.getConnectedPeerCount());
    return () => this.statusListeners.delete(callback);
  }

  public getConnectedPeerCount(): number {
    let count = 0;
    this.activeConnections.forEach((conn) => {
      if (conn.channel.readyState === "open") count++;
    });
    // If BroadcastChannel is supported, at least 1 local channel is active
    return count;
  }

  private notifyPeerCount() {
    const count = this.getConnectedPeerCount();
    this.statusListeners.forEach((fn) => fn(count));
  }

  /**
   * Check if a ticket has already been checked in at another gate via local mesh.
   */
  public queryMeshCheckIn(payloadOrId: string): MeshCheckInEvent | null {
    const cache = getMeshCheckInCache();
    return cache[payloadOrId] || null;
  }

  /**
   * Broadcast a successful check-in to all connected gates via WebRTC + BroadcastChannel
   */
  public broadcastCheckIn(item: {
    payload: string;
    requestId: string;
    participantId?: string;
    participantName?: string;
    stationName: string;
  }): void {
    const event: MeshCheckInEvent = {
      type: "MESH_CHECKIN",
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      payload: item.payload,
      requestId: item.requestId,
      participantId: item.participantId,
      participantName: item.participantName,
      stationName: item.stationName || this.localStationName,
      timestamp: new Date().toISOString()
    };

    saveMeshCheckIn(event);

    // 1. BroadcastChannel (local tabs & service worker)
    try {
      this.broadcastChannel?.postMessage(event);
    } catch {
      // Ignore
    }

    // 2. WebRTC DataChannels (P2P Wi-Fi / hotspot gates)
    const payloadStr = JSON.stringify(event);
    this.activeConnections.forEach((conn) => {
      if (conn.channel.readyState === "open") {
        try {
          conn.channel.send(payloadStr);
        } catch (err) {
          console.error("Failed to send over WebRTC mesh:", err);
        }
      }
    });
  }

  private handleIncomingCheckIn(event: MeshCheckInEvent) {
    saveMeshCheckIn(event);
    this.listeners.forEach((callback) => {
      try {
        callback(event);
      } catch (err) {
        console.error("Error in mesh check-in subscriber:", err);
      }
    });
  }

  /**
   * WebRTC Local Pairing: Create SDP Offer for pairing Station A -> Station B
   */
  public async createMeshOffer(): Promise<string> {
    const pc = new RTCPeerConnection({
      iceServers: [] // Zero internet needed; purely local ICE candidates
    });

    const channel = pc.createDataChannel("gateflow-sync", { ordered: true });
    const peerId = `peer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.activeConnections.set(peerId, { pc, channel });

    this.setupDataChannel(channel, peerId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait briefly for local host candidates
    await new Promise<void>((resolve) => {
      if (pc.iceGatheringState === "complete") {
        resolve();
      } else {
        const check = () => {
          if (pc.iceGatheringState === "complete") {
            pc.removeEventListener("icegatheringstatechange", check);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", check);
        // Fallback timeout
        setTimeout(resolve, 800);
      }
    });

    return JSON.stringify({
      sdp: pc.localDescription?.sdp,
      type: pc.localDescription?.type,
      station: this.localStationName,
      peerId
    });
  }

  /**
   * WebRTC Local Pairing: Accept SDP Offer and create Answer
   */
  public async acceptMeshOffer(offerJson: string): Promise<string> {
    const data = JSON.parse(offerJson);
    const pc = new RTCPeerConnection({ iceServers: [] });
    const peerId = data.peerId || `peer-${Date.now()}`;

    return new Promise(async (resolve, reject) => {
      pc.ondatachannel = (ev) => {
        const channel = ev.channel;
        this.activeConnections.set(peerId, { pc, channel, station: data.station });
        this.setupDataChannel(channel, peerId);
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription({ sdp: data.sdp, type: data.type }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (pc.iceGatheringState === "complete") {
          resolve(JSON.stringify({
            sdp: pc.localDescription?.sdp,
            type: pc.localDescription?.type,
            station: this.localStationName
          }));
        } else {
          const check = () => {
            if (pc.iceGatheringState === "complete") {
              pc.removeEventListener("icegatheringstatechange", check);
              resolve(JSON.stringify({
                sdp: pc.localDescription?.sdp,
                type: pc.localDescription?.type,
                station: this.localStationName
              }));
            }
          };
          pc.addEventListener("icegatheringstatechange", check);
          setTimeout(() => {
            resolve(JSON.stringify({
              sdp: pc.localDescription?.sdp,
              type: pc.localDescription?.type,
              station: this.localStationName
            }));
          }, 800);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * WebRTC Local Pairing: Finalize connection with Answer from remote station
   */
  public async finalizeMeshAnswer(answerJson: string): Promise<boolean> {
    try {
      const data = JSON.parse(answerJson);
      // Find connecting peer
      for (const [peerId, conn] of this.activeConnections.entries()) {
        if (conn.pc.signalingState === "have-local-offer") {
          await conn.pc.setRemoteDescription(new RTCSessionDescription({ sdp: data.sdp, type: data.type }));
          conn.station = data.station;
          this.notifyPeerCount();
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error("Failed to finalize mesh answer:", err);
      return false;
    }
  }

  private setupDataChannel(channel: RTCDataChannel, peerId: string) {
    channel.onopen = () => {
      console.log(`[GateFlow Mesh] DataChannel open with peer: ${peerId}`);
      this.notifyPeerCount();
    };
    channel.onclose = () => {
      console.log(`[GateFlow Mesh] DataChannel closed: ${peerId}`);
      this.activeConnections.delete(peerId);
      this.notifyPeerCount();
    };
    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "MESH_CHECKIN") {
          this.handleIncomingCheckIn(msg);
        }
      } catch (err) {
        console.error("Malformed mesh packet:", err);
      }
    };
  }
}

export const p2pMesh = new P2PMeshEngine();
