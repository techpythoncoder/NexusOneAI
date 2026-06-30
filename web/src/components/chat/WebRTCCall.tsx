"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  PhoneOff, Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, 
  Circle, Download, Sparkles, PhoneCall, Volume2, User, AlertTriangle, Terminal, Image as ImageIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface WebRTCCallProps {
  channelId: string;
  channelName: string;
  ws: WebSocket | null;
  currentUser: { id: string; email: string; full_name?: string };
  incomingSignal: any;
  onClose: () => void;
  onClearIncomingSignal: () => void;
  orgMembers: any[];
}

type CallRole = "caller" | "recipient";

export default function WebRTCCall({
  channelId,
  channelName,
  ws,
  currentUser,
  incomingSignal,
  onClose,
  onClearIncomingSignal,
  orgMembers,
}: WebRTCCallProps) {
  const [callState, setCallState] = useState<"idle" | "calling" | "incoming" | "connected" | "ended">("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // View swap state (swaps PIP and full-screen feeds)
  const [isSwapped, setIsSwapped] = useState(false);

  // Custom video filters
  const [selectedFilter, setSelectedFilter] = useState<"none" | "grayscale" | "sepia" | "invert" | "hue-rotate">("none");
  const selectedFilterRef = useRef(selectedFilter);
  useEffect(() => { selectedFilterRef.current = selectedFilter; }, [selectedFilter]);

  // Virtual Backgrounds
  const [selectedBackground, setSelectedBackground] = useState<"none" | "blur" | "beach" | "office">("none");
  const backgroundEffectRef = useRef(selectedBackground);
  useEffect(() => { backgroundEffectRef.current = selectedBackground; }, [selectedBackground]);

  const [remoteUserEmail, setRemoteUserEmail] = useState<string>("Colleague");

  // Diagnostics state
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState("new");
  const [signalingState, setSignalingState] = useState("stable");
  const [iceConnectionState, setIceConnectionState] = useState("new");

  // Track if remote video is actively playing
  const [isRemoteVideoPlaying, setIsRemoteVideoPlaying] = useState(false);
  
  // Reactive state to trigger React re-renders upon WebRTC track arrivals
  const [remoteTracksCount, setRemoteTracksCount] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Track hidden video element to prevent browser suspension
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const callRole = useRef<CallRole | null>(null);
  const remotePeerId = useRef<string | null>(null);

  // Stable reference to the active video sender to bypass browser-specific sender lookups
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  
  // Execution locks to prevent duplicate signaling events
  const startCallInitiated = useRef(false);
  const endCallInitiated = useRef(false);
  const acceptSignalProcessed = useRef(false);
  const offerSignalProcessed = useRef(false);
  const answerSignalProcessed = useRef(false);
  
  // Buffer ICE candidates until Remote Description is set
  const iceCandidatesQueue = useRef<any[]>([]);

  // Web Audio for Ringtone
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringtoneIntervalRef = useRef<any | null>(null);
  
  // Track secure context
  const [isSecure, setIsSecure] = useState(true);

  // Track timers/effects
  const filterLoopRef = useRef<number | null>(null);

  // MediaPipe Selfie Segmentation refs
  const [selfieLoaded, setSelfieLoaded] = useState(false);
  const selfieSegmentationRef = useRef<any>(null);
  const beachImageRef = useRef<HTMLImageElement | null>(null);
  const officeImageRef = useRef<HTMLImageElement | null>(null);

  // Screen share composition elements
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const isScreenSharingRef = useRef(isScreenSharing);
  useEffect(() => { isScreenSharingRef.current = isScreenSharing; }, [isScreenSharing]);

  // Helper to add timestamped diagnostic log
  const logDebug = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev.slice(-15), `[${timestamp}] ${msg}`]);
    console.log(`[WebRTC Debug] ${msg}`);
  }, []);

  // Pre-load Virtual Background Images and MediaPipe Segmenter
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Load beach background
    const beach = new Image();
    beach.crossOrigin = "anonymous";
    beach.src = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=640&q=80";
    beachImageRef.current = beach;

    // Load office background
    const office = new Image();
    office.crossOrigin = "anonymous";
    office.src = "https://images.unsplash.com/photo-1497366216548-37526070297c?w=640&q=80";
    officeImageRef.current = office;

    // Dynamically load MediaPipe Selfie Segmentation from CDN
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js";
    script.async = true;
    script.onload = () => {
      try {
        const seg = new (window as any).SelfieSegmentation({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
        });
        seg.setOptions({
          modelSelection: 1, // landscape model for fast execution
        });
        seg.onResults((results: any) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Case A: Screen Share is active - composite user cutout over screen share
          if (isScreenSharingRef.current && screenStreamRef.current) {
            const screenVideo = screenVideoRef.current;
            if (screenVideo && screenVideo.readyState >= 2) {
              // Draw letterboxed screen share keeping aspect ratio
              const sWidth = screenVideo.videoWidth || 640;
              const sHeight = screenVideo.videoHeight || 480;
              const cWidth = canvas.width;
              const cHeight = canvas.height;
              
              const scale = Math.min(cWidth / sWidth, cHeight / sHeight);
              const drawWidth = sWidth * scale;
              const drawHeight = sHeight * scale;
              const dx = (cWidth - drawWidth) / 2;
              const dy = (cHeight - drawHeight) / 2;

              ctx.fillStyle = "#09090b"; // Dark zinc bg
              ctx.fillRect(0, 0, cWidth, cHeight);
              ctx.drawImage(screenVideo, dx, dy, drawWidth, drawHeight);
            } else {
              ctx.fillStyle = "#000000";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            // Draw segmented camera PIP frame in the bottom right corner
            ctx.beginPath();
            ctx.roundRect(canvas.width - 150, canvas.height - 110, 140, 95, 8);
            ctx.clip();

            // Draw virtual backgrounds behind the user cutout inside the PIP frame
            const currentBg = backgroundEffectRef.current;
            if (currentBg === "beach" && beachImageRef.current && beachImageRef.current.complete) {
              ctx.drawImage(beachImageRef.current, canvas.width - 150, canvas.height - 110, 140, 95);
            } else if (currentBg === "office" && officeImageRef.current && officeImageRef.current.complete) {
              ctx.drawImage(officeImageRef.current, canvas.width - 150, canvas.height - 110, 140, 95);
            } else if (currentBg === "blur") {
              ctx.filter = "blur(16px)";
              ctx.drawImage(results.image, canvas.width - 150, canvas.height - 110, 140, 95);
              ctx.filter = "none";
            } else {
              ctx.fillStyle = "#18181b"; // Fallback zinc-900 background
              ctx.fillRect(canvas.width - 150, canvas.height - 110, 140, 95);
            }

            // Draw user silhouette in the PIP frame
            ctx.drawImage(results.image, canvas.width - 150, canvas.height - 110, 140, 95);

            // Add PIP frame border
            ctx.restore();
            ctx.save();
            ctx.strokeStyle = "#6366f1"; // Indigo border
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(canvas.width - 151, canvas.height - 111, 142, 97, 8);
            ctx.stroke();
          } 
          // Case B: Normal call - draw segmented user over virtual background
          else {
            // Draw the segmentation mask
            ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);

            // Render only the person inside the mask
            ctx.globalCompositeOperation = 'source-in';
            
            // Apply active video filters
            if (selectedFilterRef.current === "grayscale") ctx.filter = "grayscale(100%)";
            else if (selectedFilterRef.current === "sepia") ctx.filter = "sepia(100%)";
            else if (selectedFilterRef.current === "invert") ctx.filter = "invert(100%)";
            else if (selectedFilterRef.current === "hue-rotate") ctx.filter = "hue-rotate(90deg)";
            else ctx.filter = "none";
            
            ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

            // Draw the virtual background behind the person
            ctx.globalCompositeOperation = 'destination-over';
            ctx.filter = "none";

            const currentBg = backgroundEffectRef.current;
            if (currentBg === "beach") {
              if (beachImageRef.current && beachImageRef.current.complete) {
                ctx.drawImage(beachImageRef.current, 0, 0, canvas.width, canvas.height);
              } else {
                ctx.fillStyle = "#0284c7";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
              }
            } else if (currentBg === "office") {
              if (officeImageRef.current && officeImageRef.current.complete) {
                ctx.drawImage(officeImageRef.current, 0, 0, canvas.width, canvas.height);
              } else {
                ctx.fillStyle = "#4b5563";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
              }
            } else if (currentBg === "blur") {
              ctx.filter = "blur(16px)";
              ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
            }
          }
          ctx.restore();
        });
        selfieSegmentationRef.current = seg;
        setSelfieLoaded(true);
        logDebug("MediaPipe Segmenter loaded successfully");
      } catch (err: any) {
        logDebug(`SelfieSegmentation init failed: ${err.message}`);
      }
    };
    script.onerror = () => logDebug("MediaPipe Segmenter script load failed");
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [logDebug]);

  // Bind streams dynamically to elements depending on isSwapped state
  const bindStreams = useCallback(() => {
    const mainEl = remoteVideoRef.current;
    const pipEl = localVideoRef.current;
    if (!mainEl || !pipEl) return;

    const localSrc = selectedFilter === "none" && selectedBackground === "none" && !isScreenSharing
      ? localStream.current 
      : canvasStreamRef.current;

    if (!isSwapped) {
      // Normal View: Remote is Main background, Local is corner PIP
      if (mainEl.srcObject !== remoteStream.current) {
        mainEl.srcObject = remoteStream.current;
        mainEl.play().catch(console.warn);
      }
      if (pipEl.srcObject !== localSrc) {
        pipEl.srcObject = localSrc;
        pipEl.play().catch(console.warn);
      }
    } else {
      // Swapped View: Local is Main background, Remote is corner PIP
      if (mainEl.srcObject !== localSrc) {
        mainEl.srcObject = localSrc;
        mainEl.play().catch(console.warn);
      }
      if (pipEl.srcObject !== remoteStream.current) {
        pipEl.srcObject = remoteStream.current;
        pipEl.play().catch(console.warn);
      }
    }
  }, [isSwapped, selectedFilter, selectedBackground, isScreenSharing]);

  // Re-bind when tracks arrive or swap toggles
  useEffect(() => {
    bindStreams();
  }, [bindStreams, remoteTracksCount]);

  // Initialize remoteStream container eagerly on render to ensure it exists before mounting
  if (!remoteStream.current && typeof window !== "undefined") {
    remoteStream.current = new MediaStream();
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsSecure(window.isSecureContext);
    logDebug(`Secure Context: ${window.isSecureContext}`);
  }, [logDebug]);

  // Poll video element state to keep play overlay synced (essential for background tab suspensions)
  useEffect(() => {
    const interval = setInterval(() => {
      if (remoteVideoRef.current) {
        const isPlaying = !remoteVideoRef.current.paused && !remoteVideoRef.current.ended && remoteVideoRef.current.readyState >= 2;
        setIsRemoteVideoPlaying(isPlaying);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Callback refs to bind stream immediately when video elements mount in the DOM.
  // We force muted = true programmatically to bypass any Chrome background tab/incognito autoplay throttles.
  const setLocalVideoEl = useCallback((el: HTMLVideoElement | null) => {
    localVideoRef.current = el;
    if (el) {
      el.muted = true;
      el.autoplay = true;
      el.setAttribute("playsinline", "true");
      bindStreams();
    }
  }, [bindStreams]);

  const setRemoteVideoEl = useCallback((el: HTMLVideoElement | null) => {
    remoteVideoRef.current = el;
    if (el) {
      el.muted = true;
      el.autoplay = true;
      el.setAttribute("playsinline", "true");
      bindStreams();
    }
  }, [bindStreams]);

  // Screen share hidden video binder
  const setScreenVideoEl = useCallback((el: HTMLVideoElement | null) => {
    screenVideoRef.current = el;
    if (el && screenStreamRef.current) {
      el.muted = true;
      el.autoplay = true;
      el.setAttribute("playsinline", "true");
      el.srcObject = screenStreamRef.current;
      el.play().catch(console.warn);
    }
  }, []);

  // Get display name of a user
  const getSenderName = useCallback((senderId: string, senderEmail: string) => {
    const member = orgMembers.find((m) => m.user_id === senderId);
    return member?.user_name?.trim() || senderEmail;
  }, [orgMembers]);

  // Send WebRTC signals to backend
  const sendSignal = useCallback((action: string, payload: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      logDebug(`Sending RTC signal: ${action}`);
      ws.send(JSON.stringify({
        type: "rtc-signal",
        channel_id: channelId,
        action,
        sender_id: currentUser.id,
        sender_email: currentUser.email,
        ...payload
      }));
    } else {
      logDebug(`Failed to send RTC signal ${action}: WS disconnected`);
    }
  }, [ws, channelId, currentUser, logDebug]);

  // Play synthetic call ringtone using browser Web Audio API (Zero external assets needed)
  const startRingtone = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      const playBeep = () => {
        if (!audioCtxRef.current || audioCtxRef.current.state === "closed") return;
        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        
        // Dual tone (standard US ringback tone cycle: 480Hz + 620Hz)
        osc.type = "sine";
        osc.frequency.setValueAtTime(480, audioCtxRef.current.currentTime);
        osc.frequency.setValueAtTime(620, audioCtxRef.current.currentTime + 0.15);
        
        gain.gain.setValueAtTime(0, audioCtxRef.current.currentTime);
        gain.gain.linearRampToValueAtTime(0.2, audioCtxRef.current.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtxRef.current.currentTime + 1.2);
        
        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        
        osc.start();
        osc.stop(audioCtxRef.current.currentTime + 1.3);
      };

      playBeep();
      ringtoneIntervalRef.current = setInterval(playBeep, 2000);
    } catch (e) {
      console.error("Failed to play Web Audio ringtone:", e);
    }
  }, []);

  const stopRingtone = useCallback(() => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(console.error);
      audioCtxRef.current = null;
    }
  }, []);

  // Sync ringtone playing with calling/incoming state
  useEffect(() => {
    if (callState === "calling" || callState === "incoming") {
      startRingtone();
    } else {
      stopRingtone();
    }
    return () => stopRingtone();
  }, [callState, startRingtone, stopRingtone]);

  // Clean up streams and connection
  const endCall = useCallback((shouldNotify = true) => {
    if (endCallInitiated.current) return;
    endCallInitiated.current = true;
    logDebug("Ending call connection");

    if (shouldNotify) {
      sendSignal("hangup", {});
    }
    
    // Post chat timeline message about call ending/missed (from Caller client only to avoid duplication)
    if (callRole.current === "caller" && ws && ws.readyState === WebSocket.OPEN) {
      const msg = callState === "connected" 
        ? "📞 Video call ended" 
        : "❌ Call missed";
      ws.send(JSON.stringify({ content: msg }));
    }
    
    // Stop filters
    if (filterLoopRef.current) {
      cancelAnimationFrame(filterLoopRef.current);
      filterLoopRef.current = null;
    }
    
    // Stop recording
    if (isRecording && recorderRef.current) {
      try {
        recorderRef.current.stop();
      } catch (e) {}
    }

    // Stop streams
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }
    if (canvasStreamRef.current) {
      canvasStreamRef.current.getTracks().forEach(track => track.stop());
      canvasStreamRef.current = null;
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    // Clean up hidden DOM video element
    if (hiddenVideoRef.current) {
      if (hiddenVideoRef.current.parentNode) {
        hiddenVideoRef.current.parentNode.removeChild(hiddenVideoRef.current);
      }
      hiddenVideoRef.current = null;
    }

    // Clean up screen share resources
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }

    setCallState("ended");
    onClearIncomingSignal();
    setTimeout(() => {
      onClose();
    }, 1500);
  }, [sendSignal, isRecording, onClose, onClearIncomingSignal, ws, callState, logDebug]);

  // Set up ice server configuration
  const setupPeerConnection = useCallback((audioTrack?: MediaStreamTrack, videoTrack?: MediaStreamTrack) => {
    logDebug(`Setting up Peer Connection. Audio track: ${!!audioTrack}, Video track: ${!!videoTrack}`);
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ]
    });

    // Add local tracks to peer connection using the highly-compatible addTrack API
    try {
      if (audioTrack) {
        pc.addTrack(audioTrack, localStream.current!);
        logDebug("Added local audio track via addTrack");
      } else if (localStream.current && localStream.current.getAudioTracks().length > 0) {
        pc.addTrack(localStream.current.getAudioTracks()[0], localStream.current);
        logDebug("Added local stream audio track via addTrack");
      } else {
        pc.addTransceiver("audio", { direction: "recvonly" });
        logDebug("Added audio transceiver as recvonly");
      }

      if (videoTrack) {
        videoSenderRef.current = pc.addTrack(videoTrack, localStream.current!);
        logDebug("Added local video track via addTrack");
      } else if (localStream.current && localStream.current.getVideoTracks().length > 0) {
        videoSenderRef.current = pc.addTrack(localStream.current.getVideoTracks()[0], localStream.current);
        logDebug("Added local stream video track via addTrack");
      } else {
        const trans = pc.addTransceiver("video", { direction: "recvonly" });
        videoSenderRef.current = trans.sender;
        logDebug("Added video transceiver as recvonly");
      }
    } catch (e: any) {
      logDebug(`Failed to setup tracks: ${e.message}`);
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal("candidate", { candidate: event.candidate, target_id: remotePeerId.current });
      }
    };

    pc.ontrack = (event) => {
      logDebug(`ontrack event: received track kind=${event.track.kind}, id=${event.track.id}`);
      if (!remoteStream.current) {
        remoteStream.current = new MediaStream();
      }

      remoteStream.current.addTrack(event.track);

      // Trigger React re-render by updating track count state
      setRemoteTracksCount(remoteStream.current.getTracks().length);

      // Play as soon as track starts decoding
      event.track.onunmute = () => {
        logDebug(`Track onunmute: kind=${event.track.kind}`);
        if (event.track.kind === "video" && remoteVideoRef.current) {
          remoteVideoRef.current.play().then(() => setIsRemoteVideoPlaying(true)).catch(console.warn);
        } else if (event.track.kind === "audio" && remoteAudioRef.current) {
          remoteAudioRef.current.play().catch(console.warn);
        }
      };

      if (event.track.kind === "audio") {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = null;
          remoteAudioRef.current.srcObject = remoteStream.current;
          remoteAudioRef.current.play().catch(err => {
            logDebug(`Autoplay remote audio failed: ${err.message}`);
          });
        }
      } else if (event.track.kind === "video") {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.muted = true;
          remoteVideoRef.current.srcObject = null;
          remoteVideoRef.current.srcObject = remoteStream.current;
          remoteVideoRef.current.play()
            .then(() => {
              setIsRemoteVideoPlaying(true);
              logDebug("Remote video play success in ontrack");
            })
            .catch(err => {
              logDebug(`Autoplay remote video failed ontrack: ${err.message}`);
              setIsRemoteVideoPlaying(false);
            });
        }
      }
    };

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
      logDebug(`PeerConnection state changed: ${pc.connectionState}`);
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        endCall(false);
      }
    };

    pc.onsignalingstatechange = () => {
      setSignalingState(pc.signalingState);
      logDebug(`Signaling state changed: ${pc.signalingState}`);
    };

    pc.oniceconnectionstatechange = () => {
      setIceConnectionState(pc.iceConnectionState);
      logDebug(`ICE Connection state changed: ${pc.iceConnectionState}`);
    };

    peerConnection.current = pc;
    return pc;
  }, [sendSignal, endCall, logDebug, bindStreams]);

  // Canvas filter processing loop (Ref-based render loop to avoid stale closure lags)
  const startFilterLoop = useCallback((videoElement: HTMLVideoElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let active = true;

    const render = () => {
      if (!active) return; // Exit only if loop is stopped

      if (canvas.width !== 640) {
        canvas.width = 640;
        canvas.height = 480;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const isSharing = isScreenSharingRef.current;
      const screenVideo = screenVideoRef.current;
      const activeFilter = selectedFilterRef.current;
      const webcamReady = videoElement.readyState >= 2 && !videoElement.paused && !videoElement.ended;

      // Case A: Screen Share is active - draw screen background and overlay webcam in corner
      if (isSharing && screenVideo && screenVideo.readyState >= 2) {
        // Draw letterboxed screen share keeping aspect ratio
        const sWidth = screenVideo.videoWidth || 640;
        const sHeight = screenVideo.videoHeight || 480;
        const cWidth = canvas.width;
        const cHeight = canvas.height;
        
        const scale = Math.min(cWidth / sWidth, cHeight / sHeight);
        const drawWidth = sWidth * scale;
        const drawHeight = sHeight * scale;
        const dx = (cWidth - drawWidth) / 2;
        const dy = (cHeight - drawHeight) / 2;

        ctx.fillStyle = "#09090b"; // Dark zinc bg
        ctx.fillRect(0, 0, cWidth, cHeight);
        ctx.drawImage(screenVideo, dx, dy, drawWidth, drawHeight);

        // Draw webcam thumbnail in the corner ONLY if the webcam is active and not disabled
        if (webcamReady && !isVideoOff) {
          ctx.fillStyle = "#000000";
          ctx.fillRect(canvas.width - 150, canvas.height - 110, 140, 95);
          
          if (activeFilter === "grayscale") ctx.filter = "grayscale(100%)";
          else if (activeFilter === "sepia") ctx.filter = "sepia(100%)";
          else if (activeFilter === "invert") ctx.filter = "invert(100%)";
          else if (activeFilter === "hue-rotate") ctx.filter = "hue-rotate(90deg)";
          else ctx.filter = "none";
          
          ctx.drawImage(videoElement, canvas.width - 150, canvas.height - 110, 140, 95);
          ctx.filter = "none";

          // Draw border around webcam thumbnail
          ctx.strokeStyle = "#6366f1"; // Indigo border
          ctx.lineWidth = 3;
          ctx.strokeRect(canvas.width - 151, canvas.height - 111, 142, 97);
        }
      } 
      // Case B: Normal Call - just draw webcam with filter applied
      else {
        if (webcamReady && !isVideoOff) {
          if (activeFilter === "grayscale") ctx.filter = "grayscale(100%)";
          else if (activeFilter === "sepia") ctx.filter = "sepia(100%)";
          else if (activeFilter === "invert") ctx.filter = "invert(100%)";
          else if (activeFilter === "hue-rotate") ctx.filter = "hue-rotate(90deg)";
          else ctx.filter = "none";

          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          ctx.filter = "none";
        } else {
          // Render dark zinc placeholder if camera is off
          ctx.fillStyle = "#09090b";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#ffffff";
          ctx.font = "14px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("Camera Off", canvas.width / 2, canvas.height / 2);
        }
      }

      filterLoopRef.current = requestAnimationFrame(render);
    };

    videoElement.onloadedmetadata = () => {
      videoElement.play().catch(console.error);
      render();
    };

    if (videoElement.readyState >= 2) {
      render();
    } else {
      render();
    }

    return () => {
      active = false;
    };
  }, [isVideoOff]);

  // Set up local media stream
  const startLocalMedia = useCallback(async () => {
    logDebug("Requesting local media stream (camera/mic)");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStream.current = stream;
      logDebug("Successfully captured audio/video tracks locally");

      // Show native stream by default if element is already mounted
      if (localVideoRef.current) {
        localVideoRef.current.muted = true;
        localVideoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      logDebug(`getUserMedia error: ${err.message}. Retrying audio-only fallback.`);
      // Fallback to audio-only if camera is unavailable or blocked
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStream.current = audioStream;
        logDebug("Audio-only fallback access successful");
      } catch (e: any) {
        logDebug(`Audio-only access failed: ${e.message}`);
      }
    }
  }, [logDebug]);

  // Update track on-the-fly when filters or backgrounds change
  useEffect(() => {
    if (!localStream.current) return;
    const webcamTrack = localStream.current.getVideoTracks()[0];
    if (!webcamTrack) return;

    let segmenterTimer: any = null;

    const applyTrack = async () => {
      const needsCanvas = selectedFilter !== "none" || selectedBackground !== "none" || isScreenSharing;
      const videoSender = videoSenderRef.current;

      if (!needsCanvas) {
        // Stop canvas filter loops if running
        if (filterLoopRef.current) {
          cancelAnimationFrame(filterLoopRef.current);
          filterLoopRef.current = null;
        }

        // Show native webcam stream locally
        if (localVideoRef.current) {
          localVideoRef.current.muted = true;
          localVideoRef.current.srcObject = localStream.current;
        }

        // Send native webcam track to remote peer
        if (peerConnection.current && peerConnection.current.signalingState !== "closed" && videoSender) {
          logDebug("Replaced remote track with native webcam");
          try {
            await videoSender.replaceTrack(webcamTrack);
          } catch (e: any) {
            logDebug(`replaceTrack failed: ${e.message}`);
          }
        }
      } else {
        // Start canvas loop
        const video = hiddenVideoRef.current || document.createElement("video");
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (!hiddenVideoRef.current) {
          video.srcObject = localStream.current;
          video.muted = true;
          video.setAttribute("playsinline", "true");
          video.style.position = "absolute";
          video.style.width = "0px";
          video.style.height = "0px";
          video.style.opacity = "0";
          video.style.pointerEvents = "none";
          document.body.appendChild(video);
          hiddenVideoRef.current = video;
        }
        
        // Stop standard filter loop if virtual backgrounds are running
        if (filterLoopRef.current) {
          cancelAnimationFrame(filterLoopRef.current);
          filterLoopRef.current = null;
        }

        // Set canvas dimensions eagerly
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        // Draw an initial frame on canvas immediately to feed the WebRTC encoder and prevent starvation
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#18181b"; // Dark zinc
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          if (video.readyState >= 2) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          }
        }

        // Capture canvas stream
        let canvasTrack: MediaStreamTrack | null = null;
        if (canvas) {
          // If we already have a captured canvas stream, use its track. Otherwise capture new.
          if (!canvasStreamRef.current) {
            canvasStreamRef.current = (canvas as any).captureStream(30);
          }
          canvasTrack = canvasStreamRef.current?.getVideoTracks()[0] || null;
          
          if (localVideoRef.current) {
            localVideoRef.current.muted = true;
            localVideoRef.current.srcObject = canvasStreamRef.current;
          }

          if (peerConnection.current && peerConnection.current.signalingState !== "closed" && videoSender && canvasTrack) {
            logDebug("Replaced remote track with canvas filter track");
            try {
              await videoSender.replaceTrack(canvasTrack);
            } catch (e: any) {
              logDebug(`replaceTrack failed: ${e.message}`);
            }
          }
        }

        if (selectedBackground !== "none" && selfieLoaded && selfieSegmentationRef.current && !isScreenSharing) {
          let active = true;
          const feedModel = async () => {
            if (!active || video.paused || video.ended) return;
            try {
              await selfieSegmentationRef.current.send({ image: video });
            } catch (e) {}
            
            // Limit segmentation calculations to 24fps for smooth performance
            segmenterTimer = setTimeout(() => {
              if (active) requestAnimationFrame(feedModel);
            }, 40);
          };
          
          video.onloadedmetadata = () => {
            video.play().catch(console.error);
            feedModel();
          };
          if (video.readyState >= 2) {
            video.play().catch(console.error);
            feedModel();
          }
        } else {
          // Standard video filters & Screen sharing
          startFilterLoop(video);
        }
      }
    };

    applyTrack().catch(console.error);

    return () => {
      if (segmenterTimer) clearTimeout(segmenterTimer);
    };
  }, [selectedFilter, selectedBackground, startFilterLoop, selfieLoaded, logDebug, isScreenSharing]);

  // Initiate call
  const startCall = useCallback(async () => {
    logDebug("Starting outgoing call sequence");
    setCallState("calling");
    callRole.current = "caller";
    await startLocalMedia();
    sendSignal("invite", {});

    // Post chat timeline message: "🎥 Started a video call"
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ content: "🎥 Started a video call" }));
    }
  }, [startLocalMedia, sendSignal, ws, logDebug]);

  // Flush queued candidates
  const flushIceCandidates = useCallback(async () => {
    if (!peerConnection.current) return;
    logDebug(`Flushing ICE Candidate queue (${iceCandidatesQueue.current.length} candidates)`);
    while (iceCandidatesQueue.current.length > 0) {
      const cand = iceCandidatesQueue.current.shift();
      if (cand) {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e: any) {
          logDebug(`Error flushing candidate: ${e.message}`);
        }
      }
    }
  }, [logDebug]);

  // Accept incoming call
  const acceptCall = useCallback(async () => {
    if (!incomingSignal) return;
    logDebug("Accepting incoming call");
    
    setCallState("connected");
    callRole.current = "recipient";
    remotePeerId.current = incomingSignal.sender_id;
    setRemoteUserEmail(incomingSignal.sender_email);

    await startLocalMedia();
    
    const audioTrack = localStream.current?.getAudioTracks()[0];
    const videoTrack = localStream.current?.getVideoTracks()[0];
    
    setupPeerConnection(audioTrack, videoTrack);

    sendSignal("accept", { target_id: remotePeerId.current });
  }, [incomingSignal, startLocalMedia, setupPeerConnection, sendSignal, logDebug]);

  // Reject call
  const rejectCall = useCallback(() => {
    logDebug("Rejecting incoming call");
    sendSignal("reject", { target_id: incomingSignal?.sender_id });
    onClearIncomingSignal();
    onClose();
  }, [incomingSignal, sendSignal, onClearIncomingSignal, onClose, logDebug]);

  // Toggle audio
  const toggleMute = () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        logDebug(`Muted mic: ${!audioTrack.enabled}`);
      }
    }
  };

  // Toggle video or request permission if missing
  const toggleVideo = async () => {
    if (localStream.current) {
      const videoTrack = localStream.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
        logDebug(`Toggled video: ${videoTrack.enabled}`);
        return;
      }
    }
    
    // Fallback: If no video track exists, try to request camera permission and add it!
    try {
      logDebug("Requesting local camera access fallback");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      if (track) {
        if (!localStream.current) {
          localStream.current = new MediaStream();
        }
        localStream.current.addTrack(track);
        
        // Render raw local preview
        if (selectedFilter === "none" && localVideoRef.current) {
          localVideoRef.current.muted = true;
          localVideoRef.current.srcObject = localStream.current;
        }

        // Add track to peer connection if connected
        if (peerConnection.current) {
          const videoSender = videoSenderRef.current;
          if (videoSender) {
            await videoSender.replaceTrack(track);
          } else {
            videoSenderRef.current = peerConnection.current.addTrack(track, localStream.current!);
            logDebug("Added new local video track to peer connection");
          }
        }
        
        setIsVideoOff(false);
        toast.success("Camera activated successfully!");
      }
    } catch (err: any) {
      logDebug(`Fallback camera access failed: ${err.message}`);
      toast.error("Camera access denied. Please enable camera permissions in your browser address bar.");
    }
  };

  // Screen Sharing
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        logDebug("Requesting display stream for screen sharing");
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        // Store screen stream in ref
        screenStreamRef.current = screenStream;

        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = screenStream;
          screenVideoRef.current.play().catch(console.warn);
        }

        // Render screen stream combined with camera on canvas
        setIsScreenSharing(true);

        // Handle stream stop by browser control bar
        screenTrack.onended = () => {
          stopScreenShare();
        };
      } catch (err) {
        console.error("Screen share error:", err);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = async () => {
    logDebug("Stopping screen sharing");
    
    // Stop screen share tracks
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }

    setIsScreenSharing(false);
  };

  // Start Call Recording
  const toggleRecording = () => {
    if (!isRecording) {
      recordedChunks.current = [];
      const tracks = [];

      // Combine video track and audio tracks
      if (localStream.current) {
        tracks.push(...localStream.current.getAudioTracks());
      }
      if (remoteStream.current) {
        tracks.push(...remoteStream.current.getVideoTracks());
        tracks.push(...remoteStream.current.getAudioTracks());
      }

      if (tracks.length === 0) return;

      const combinedStream = new MediaStream(tracks);
      const recorder = new MediaRecorder(combinedStream, { mimeType: "video/webm" });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunks.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = `call-record-${channelName}-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);
      };

      recorder.start(1000); // chunk every second
      recorderRef.current = recorder;
      setIsRecording(true);
      logDebug("Call recording started");
    } else {
      if (recorderRef.current) {
        recorderRef.current.stop();
        setIsRecording(false);
        logDebug("Call recording stopped");
      }
    }
  };

  // Handle incoming RTC signaling
  useEffect(() => {
    if (!incomingSignal) return;

    const handleSignal = async () => {
      const { action, sdp, candidate, sender_id, sender_email } = incomingSignal;
      
      // Ignore loopback signals broadcasted back to ourselves by the backend
      if (sender_id === currentUser.id) {
        return;
      }

      logDebug(`Received RTC signal action: ${action}`);

      if (action === "invite" && callState === "idle") {
        setCallState("incoming");
        setRemoteUserEmail(sender_email);
        remotePeerId.current = sender_id;
      }
      
      else if (action === "accept" && callState === "calling") {
        if (acceptSignalProcessed.current) return;
        acceptSignalProcessed.current = true;

        setCallState("connected");
        remotePeerId.current = sender_id;
        setRemoteUserEmail(sender_email);
        
        const audioTrack = localStream.current?.getAudioTracks()[0];
        const videoTrack = localStream.current?.getVideoTracks()[0];
        
        const pc = setupPeerConnection(audioTrack, videoTrack);

        // Create WebRTC Offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal("offer", { sdp: offer, target_id: remotePeerId.current });
      }

      else if (action === "offer" && peerConnection.current) {
        if (offerSignalProcessed.current) return;
        if (peerConnection.current.signalingState === "stable" || peerConnection.current.signalingState === "have-local-offer") {
          offerSignalProcessed.current = true;
          logDebug("Applying Remote Offer SDP");
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(sdp));
          
          logDebug("Creating Local Answer SDP");
          const answer = await peerConnection.current.createAnswer();
          await peerConnection.current.setLocalDescription(answer);
          sendSignal("answer", { sdp: answer, target_id: remotePeerId.current });
          
          // Flush any candidates buffered before remote description was set
          await flushIceCandidates();
        }
      }

      else if (action === "answer" && peerConnection.current) {
        if (answerSignalProcessed.current) return;
        if (peerConnection.current.signalingState === "have-local-offer") {
          answerSignalProcessed.current = true;
          logDebug("Applying Remote Answer SDP");
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(sdp));
          
          // Flush any candidates buffered before remote description was set
          await flushIceCandidates();
        }
      }

      else if (action === "candidate" && peerConnection.current) {
        // Queue candidates if remote description is not set yet
        if (!peerConnection.current.remoteDescription) {
          logDebug("Queueing incoming ICE candidate (remote description not set)");
          iceCandidatesQueue.current.push(candidate);
        } else {
          try {
            await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
            logDebug("Added incoming ICE candidate immediately");
          } catch (e: any) {
            logDebug(`Error adding ice candidate immediately: ${e.message}`);
          }
        }
      }

      else if (action === "hangup" || action === "reject") {
        endCall(false);
      }
    };

    handleSignal();
  }, [incomingSignal, callState, setupPeerConnection, sendSignal, endCall, flushIceCandidates, logDebug, currentUser.id]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
      }
      if (canvasStreamRef.current) {
        canvasStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerConnection.current) {
        peerConnection.current.close();
      }
      if (filterLoopRef.current) {
        cancelAnimationFrame(filterLoopRef.current);
      }
      if (hiddenVideoRef.current) {
        if (hiddenVideoRef.current.parentNode) {
          hiddenVideoRef.current.parentNode.removeChild(hiddenVideoRef.current);
        }
        hiddenVideoRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
      }
      stopRingtone();
    };
  }, [stopRingtone]);

  // Set call to outgoing upon render if caller role initialized
  useEffect(() => {
    if (callState === "idle" && !incomingSignal && !startCallInitiated.current) {
      startCallInitiated.current = true;
      startCall();
    }
  }, [callState, incomingSignal, startCall]);

  const resolvedRemoteName = getSenderName(remotePeerId.current || "", remoteUserEmail);

  // Check if camera or microphone permissions are blocked
  const isMicBlocked = !localStream.current || localStream.current.getAudioTracks().length === 0;
  const isCamBlocked = !localStream.current || localStream.current.getVideoTracks().length === 0;

  const hasRemoteVideoTrack = remoteStream.current && remoteStream.current.getVideoTracks().length > 0;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Hidden canvas for video filter rendering */}
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Hidden audio element to ensure remote audio tracks bypass video autoplay restrictions */}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      {/* Hidden screen share video player to sync feed composition */}
      <video ref={setScreenVideoEl} autoPlay playsInline muted className="hidden" />

      {/* Floating Calling Window */}
      <div className="bg-background/85 backdrop-blur-md border border-border/85 w-full max-w-3xl aspect-[16/10] rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
        
        {/* Insecure Context Warning */}
        {!isSecure && (
          <div className="bg-rose-600/80 backdrop-blur-sm border-b border-rose-500/30 px-4 py-2.5 text-xs text-rose-50 font-medium flex items-center gap-1.5 z-30 animate-pulse">
            <AlertTriangle className="h-4 w-4 text-rose-200 animate-bounce" />
            <span>
              <strong>Insecure Context:</strong> Your browser disables camera/microphone access on custom domains without HTTPS. Please use <a href="http://localhost:3002/chat" className="underline font-bold text-white">http://localhost:3002</a> or enable HTTPS.
            </span>
          </div>
        )}

        {/* Permission Warning Banner */}
        {callState === "connected" && (isMicBlocked || isCamBlocked) && (
          <div className="bg-amber-600/80 backdrop-blur-sm border-b border-amber-500/30 px-4 py-2.5 text-xs text-amber-50 font-medium flex items-center justify-between gap-4 z-30 animate-pulse">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-200" />
              {isMicBlocked && isCamBlocked 
                ? "Microphone and Camera permissions are blocked. Others cannot hear or see you." 
                : isMicBlocked 
                  ? "Microphone permission is blocked. Others cannot hear you." 
                  : "Camera permission is blocked. Others cannot see you."}
            </span>
            <Button 
              size="sm" 
              variant="outline" 
              className="h-6 text-[10px] bg-amber-500/10 border-amber-500/20 text-amber-50 hover:bg-amber-500/20 font-bold" 
              onClick={toggleVideo}
            >
              Enable Camera
            </Button>
          </div>
        )}

        {/* State Banner: INCOMING CALL */}
        {callState === "incoming" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <div className="relative">
              <Avatar className="h-20 w-20 animate-pulse ring-4 ring-indigo-500/20">
                <AvatarFallback className="bg-indigo-500/10 text-indigo-500 text-lg font-bold">
                  {resolvedRemoteName[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 bg-indigo-500 p-2 rounded-full text-white animate-bounce">
                <PhoneCall className="h-4 w-4" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold">{resolvedRemoteName}</h3>
              <p className="text-sm text-muted-foreground">Incoming video call...</p>
            </div>
            <div className="flex gap-4">
              <Button onClick={acceptCall} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-6 py-5 h-auto animate-bounce">
                Accept
              </Button>
              <Button onClick={rejectCall} variant="destructive" className="rounded-full px-6 py-5 h-auto">
                Reject
              </Button>
            </div>
          </div>
        )}

        {/* State Banner: CALLING (OUTGOING) */}
        {callState === "calling" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <Avatar className="h-20 w-20 ring-4 ring-muted animate-pulse">
              <AvatarFallback className="text-lg bg-muted font-bold">
                {resolvedRemoteName[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <h3 className="text-lg font-semibold">Calling channel members...</h3>
              <p className="text-sm text-muted-foreground">Waiting for response in #{channelName}</p>
            </div>
            <Button onClick={() => endCall(true)} variant="destructive" className="rounded-full p-6 h-auto flex gap-2">
              <PhoneOff className="h-4 w-4" /> Cancel Call
            </Button>
          </div>
        )}

        {/* State Banner: ENDED */}
        {callState === "ended" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <PhoneOff className="h-12 w-12 text-rose-500 animate-bounce" />
            <h3 className="text-lg font-semibold">Call Ended</h3>
          </div>
        )}

        {/* State: CONNECTED CALL GRID */}
        {callState === "connected" && (
          <div className="flex-1 min-h-0 relative bg-zinc-950 flex animate-fade-in">
            {/* Remote Feed (Main Background) */}
            <div className="flex-1 h-full relative flex items-center justify-center bg-zinc-950">
              <video 
                ref={setRemoteVideoEl} 
                autoPlay 
                playsInline 
                muted
                className="w-full h-full object-contain"
              />
              <div className="absolute top-4 left-4 bg-background/60 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-medium border border-border flex items-center gap-1.5 z-20">
                <Volume2 className="h-3.5 w-3.5 text-indigo-400" />
                {isSwapped ? "Your Stream (Self)" : resolvedRemoteName}
              </div>
            </div>

            {/* Play Fallback Overlay (Shown if browser blocks autoplay) */}
            {hasRemoteVideoTrack && !isRemoteVideoPlaying && (
              <div className="absolute inset-0 bg-zinc-950/70 flex flex-col items-center justify-center gap-3 z-10">
                <Button 
                  onClick={() => {
                    logDebug("User clicked Play Video overlay button");
                    if (remoteVideoRef.current) {
                      remoteVideoRef.current.play()
                        .then(() => {
                          setIsRemoteVideoPlaying(true);
                          logDebug("Overlay button play succeeded");
                        })
                        .catch(err => {
                          logDebug(`Overlay button play failed: ${err.message}`);
                          toast.error("Could not play video: " + err.message);
                        });
                    }
                  }}
                  className="bg-indigo-600 hover:bg-indigo-750 text-white rounded-full px-6 py-5 h-auto flex gap-2 font-bold shadow-lg animate-bounce"
                >
                  <Video className="h-5 w-5 animate-pulse" /> Click to Show Remote Video
                </Button>
                <p className="text-xs text-zinc-400 font-medium">Your browser blocked the video feed from playing automatically.</p>
              </div>
            )}

            {/* Local Feed (Draggable Picture-in-Picture) */}
            <div 
              onClick={() => setIsSwapped(!isSwapped)}
              title="Click to swap view"
              className="absolute bottom-4 right-4 w-44 aspect-video rounded-xl overflow-hidden border-2 border-indigo-500/30 shadow-lg bg-zinc-900 z-10 cursor-pointer hover:border-indigo-500 transition-all group"
            >
              <video 
                ref={setLocalVideoEl} 
                autoPlay 
                playsInline 
                muted
                className={cn("w-full h-full object-cover", (isVideoOff || isCamBlocked) && !isSwapped && "hidden")}
              />
              {(isVideoOff || isCamBlocked) && !isSwapped && (
                <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground bg-zinc-900 font-bold">
                  Camera Off
                </div>
              )}
              {/* Hover indicator overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white font-bold transition-opacity">
                Swap View
              </div>
              <div className="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-[8px] text-zinc-300 font-medium z-20">
                {isSwapped ? resolvedRemoteName : "Self"}
              </div>
            </div>

            {/* Live WebRTC Diagnostics Overlay */}
            {showDebug && (
              <div className="absolute left-4 bottom-4 w-72 bg-black/90 border border-zinc-800 rounded-xl p-3 z-30 font-mono text-[9px] text-zinc-400 flex flex-col gap-1.5 max-h-56 overflow-hidden">
                <div className="flex justify-between items-center border-b border-zinc-800 pb-1 text-white">
                  <span className="flex items-center gap-1">
                    <Terminal className="h-3 w-3 text-indigo-400" /> WebRTC Debug Panel
                  </span>
                  <button onClick={() => setShowDebug(false)} className="text-[10px] hover:text-white">✕</button>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                  <span>Connection:</span>
                  <span className={cn("text-right font-bold", connectionState === "connected" ? "text-emerald-400" : "text-amber-400")}>{connectionState}</span>
                  
                  <span>Signaling:</span>
                  <span className="text-right text-indigo-300 font-bold">{signalingState}</span>
                  
                  <span>ICE Connection:</span>
                  <span className="text-right text-zinc-300">{iceConnectionState}</span>
                  
                  <span>Local Tracks:</span>
                  <span className="text-right text-zinc-300">
                    {localStream.current ? localStream.current.getTracks().map(t => t.kind).join(",") : "none"}
                  </span>

                  <span>Remote Tracks:</span>
                  <span className="text-right text-zinc-300">
                    {remoteStream.current ? remoteStream.current.getTracks().map(t => `${t.kind}(${t.readyState})`).join(",") : "none"}
                  </span>
                </div>
                <div className="border-t border-zinc-800 pt-1.5 flex-1 overflow-y-auto flex flex-col gap-0.5 max-h-24 pr-1">
                  {debugLogs.map((log, idx) => (
                    <div key={idx} className="whitespace-pre-wrap leading-tight text-zinc-500 hover:text-zinc-300">{log}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Pulse Recording Dot */}
            {isRecording && (
              <div className="absolute top-4 right-4 bg-red-600/80 backdrop-blur-sm text-white text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md flex items-center gap-1.5 animate-pulse z-20">
                <Circle className="h-2 w-2 fill-current" /> Rec
              </div>
            )}
          </div>
        )}

        {/* Bottom Call Controls (Connected Screen only) */}
        {callState === "connected" && (
          <div className="p-4 border-t border-border flex items-center justify-between gap-4 bg-background/90 z-20">
            {/* Left: Video Effects & Background select */}
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              <select 
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value as any)}
                disabled={isVideoOff || isCamBlocked}
                title="Filters"
                className="text-xs bg-muted border border-border rounded-md px-2.5 py-1.5 font-medium outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              >
                <option value="none">No Filter</option>
                <option value="grayscale">Grayscale</option>
                <option value="sepia">Sepia (Vintage)</option>
                <option value="invert">Invert (X-Ray)</option>
                <option value="hue-rotate">Hue Cycling</option>
              </select>

              <ImageIcon className="h-4 w-4 text-emerald-400 ml-1.5" />
              <select 
                value={selectedBackground}
                onChange={(e) => setSelectedBackground(e.target.value as any)}
                disabled={isVideoOff || isCamBlocked}
                title="Virtual Backgrounds"
                className="text-xs bg-muted border border-border rounded-md px-2.5 py-1.5 font-medium outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              >
                <option value="none">No Background</option>
                <option value="blur">Blur (Portrait)</option>
                <option value="beach">Sunset Beach</option>
                <option value="office">Modern Office</option>
              </select>
              
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-7 text-[10px] text-zinc-500 hover:text-zinc-300"
                onClick={() => setShowDebug(!showDebug)}
              >
                Debug Panel
              </Button>
            </div>

            {/* Center: Main controls */}
            <div className="flex items-center gap-3">
              {/* Mic toggle */}
              <Button 
                size="icon" 
                variant={(isMuted || isMicBlocked) ? "destructive" : "secondary"} 
                className="rounded-full h-10 w-10 shadow-sm"
                onClick={toggleMute}
                disabled={isMicBlocked}
                title={(isMuted || isMicBlocked) ? "Unmute Mic" : "Mute Mic"}
              >
                {(isMuted || isMicBlocked) ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>

              {/* Video toggle */}
              <Button 
                size="icon" 
                variant={(isVideoOff || isCamBlocked) ? "destructive" : "secondary"} 
                className="rounded-full h-10 w-10 shadow-sm"
                onClick={toggleVideo}
                title={(isVideoOff || isCamBlocked) ? "Turn Video On" : "Turn Video Off"}
              >
                {(isVideoOff || isCamBlocked) ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
              </Button>

              {/* Screen Share */}
              <Button 
                size="icon" 
                variant={isScreenSharing ? "secondary" : "outline"} 
                className={cn("rounded-full h-10 w-10 shadow-sm", isScreenSharing && "bg-indigo-500 hover:bg-indigo-600 text-white")}
                onClick={toggleScreenShare}
                disabled={isCamBlocked}
                title={isScreenSharing ? "Stop Screen Share" : "Share Screen"}
              >
                {isScreenSharing ? <MonitorOff className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
              </Button>

              {/* Recording */}
              <Button 
                size="icon" 
                variant={isRecording ? "destructive" : "outline"} 
                className={cn("rounded-full h-10 w-10 shadow-sm", isRecording && "animate-pulse")}
                onClick={toggleRecording}
                title={isRecording ? "Stop Recording" : "Record Call"}
              >
                {isRecording ? <Download className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
              </Button>
            </div>

            {/* Right: End Call button */}
            <Button onClick={() => endCall(true)} variant="destructive" className="rounded-full px-5 py-2 flex gap-1.5 shadow-md shadow-red-500/10">
              <PhoneOff className="h-4 w-4" /> End Call
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
