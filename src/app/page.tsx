"use client";

import { useEffect, useRef, useState, useCallback } from "react";

import Webcam from "react-webcam";

import Link from "next/link";
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { TriangleAlert, Volume2, Music, Info, Play } from "lucide-react";

import {
  FilesetResolver,
  HandLandmarker,
  NormalizedLandmark,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

const WIDTH = 1280;
const HEIGHT = 720;
const INDEX_THUMB_TIP = 4;
const INDEX_INDEX_FINGER_TIP = 8;
const LEFT_THUMB_TIP = 4;
const LEFT_INDEX_FINGER_TIP = 8;

interface AudioState {
  ctx: AudioContext | null;
  oscillator: OscillatorNode | null;
  gainNode: GainNode | null;
  isPlaying: boolean;
}

export default function App() {
  const webcamRef = useRef<Webcam>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const lastVideoTime = useRef<number>(-1);

  const [landmarker, setLandmarker] = useState<HandLandmarker | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isPinchActive, setIsPinchActive] = useState(false);
  const [currentFrequency, setCurrentFrequency] = useState(0);
  const [currentGain, setCurrentGain] = useState(0);
  const [audioState, setAudioState] = useState<AudioState>({
    ctx: null,
    oscillator: null,
    gainNode: null,
    isPlaying: false,
  });
  const [showAlert, setShowAlert] = useState(true);

  const initAudio = useCallback(() => {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, ctx.currentTime);
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start();

    setAudioState({ ctx, oscillator, gainNode, isPlaying: false });
  }, []);

  const stopSound = useCallback(() => {
    if (audioState.gainNode && audioState.ctx) {
      audioState.gainNode.gain.setTargetAtTime(0, audioState.ctx.currentTime, 0.05);
    }
    setAudioState(prev => ({ ...prev, isPlaying: false }));
  }, [audioState.gainNode, audioState.ctx]);

  const playSound = useCallback((frequency: number, gain: number) => {
    if (!audioState.ctx || !audioState.oscillator || !audioState.gainNode) return;
    
    if (audioState.ctx.state === 'suspended') {
      audioState.ctx.resume();
    }

    audioState.oscillator.frequency.setTargetAtTime(frequency, audioState.ctx.currentTime, 0.01);
    audioState.gainNode.gain.setTargetAtTime(gain, audioState.ctx.currentTime, 0.05);
    
    setAudioState(prev => ({ ...prev, isPlaying: true }));
  }, [audioState]);

  async function loadModel() {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      
      const handLandmarker = await HandLandmarker.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "CPU",
          },
          numHands: 2,
          runningMode: "VIDEO",
        }
      );
      
      setLandmarker(handLandmarker);
      setIsModelLoading(false);
    } catch (error) {
      console.error("Failed to load MediaPipe model:", error);
    }
  }

  const detectPinch = (
    landmarks: NormalizedLandmark[],
    width: number,
    height: number,
    isLeftHand: boolean = false
  ) => {
    const thumbTip = landmarks[isLeftHand ? LEFT_THUMB_TIP : INDEX_THUMB_TIP];
    const indexFingerTip = landmarks[isLeftHand ? LEFT_INDEX_FINGER_TIP : INDEX_INDEX_FINGER_TIP];

    const dx = (thumbTip.x - indexFingerTip.x) * width;
    const dy = (thumbTip.y - indexFingerTip.y) * height;

    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < 80;
  };

  const calcFrequency = (landmarks: NormalizedLandmark[]) => {
    const minFrequency = 80;
    const maxFrequency = 1200;
    const thumbTip = landmarks[INDEX_THUMB_TIP];
    return (thumbTip.x * (maxFrequency - minFrequency)) + minFrequency;
  };

  const calcGain = (landmarks: NormalizedLandmark[], leftHandLandmarks?: NormalizedLandmark[]) => {
    if (leftHandLandmarks && leftHandLandmarks.length > 0) {
      const leftThumbTip = leftHandLandmarks[LEFT_THUMB_TIP];
      const minGain = 0;
      const maxGain = 0.5;
      return ((1 - leftThumbTip.y) * (maxGain - minGain)) + minGain;
    }
    
    const minGain = 0;
    const maxGain = 0.3;
    const thumbTip = landmarks[INDEX_THUMB_TIP];
    return ((1 - thumbTip.y) * (maxGain - minGain)) + minGain;
  };

  const renderLoop = useCallback(() => {
    if (!landmarker || !webcamRef.current || !webcamRef.current.video || !canvasRef.current) {
      animationRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    const video = webcamRef.current.video;
    
    if (video.readyState !== 4) {
      animationRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    if (lastVideoTime.current === video.currentTime) {
      animationRef.current = requestAnimationFrame(renderLoop);
      return;
    }
    
    lastVideoTime.current = video.currentTime;

    const canvasEl = canvasRef.current;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    canvasEl.width = WIDTH;
    canvasEl.height = HEIGHT;

    ctx.save();
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    const result = landmarker.detectForVideo(video, Date.now());
    
    let rightHandPinch = false;
    let rightHandLandmarks: NormalizedLandmark[] = [];
    let leftHandLandmarks: NormalizedLandmark[] = [];

    if (result.landmarks && result.landmarks.length > 0) {
      const drawingUtils = new DrawingUtils(ctx);
      
      result.landmarks.forEach((landmarks, index) => {
        const isLeftHand = index === 1 || (result.landmarks && result.landmarks.length === 1 && landmarks[4].x < 0.5);
        
        if (!isLeftHand && rightHandLandmarks.length === 0) {
          rightHandLandmarks = landmarks;
          rightHandPinch = detectPinch(landmarks, WIDTH, HEIGHT, false);
          
          if (rightHandPinch) {
            const frequency = calcFrequency(landmarks);
            const gain = calcGain(landmarks, leftHandLandmarks.length > 0 ? leftHandLandmarks : undefined);
            setCurrentFrequency(Math.round(frequency));
            setCurrentGain(Math.round(gain * 100));
            playSound(frequency, gain);
          }
        } else if (isLeftHand && leftHandLandmarks.length === 0) {
          leftHandLandmarks = landmarks;
        }
        
        if (rightHandPinch && leftHandLandmarks.length > 0) {
          const gain = calcGain(rightHandLandmarks, leftHandLandmarks);
          setCurrentGain(Math.round(gain * 100));
          playSound(currentFrequency, gain);
        }

        const color = isLeftHand ? "#00BFFF" : "#00FF00";
        drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
          color: color,
          lineWidth: 2,
        });
        drawingUtils.drawLandmarks(landmarks, {
          color: isLeftHand ? "#FF69B4" : "#FF0000",
          lineWidth: 1,
          radius: 3,
        });
      });
    }

    if (!rightHandPinch && audioState.isPlaying) {
      stopSound();
    }

    setIsPinchActive(rightHandPinch);

    animationRef.current = requestAnimationFrame(renderLoop);
  }, [landmarker, audioState, playSound, stopSound, currentFrequency]);

  const startDetection = useCallback(() => {
    if (!isDetecting && landmarker) {
      setIsDetecting(true);
      initAudio();
      renderLoop();
    }
  }, [isDetecting, landmarker, initAudio, renderLoop]);

  useEffect(() => {
    loadModel();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioState.ctx) {
        audioState.ctx.close();
      }
    };
  }, []);

  useEffect(() => {
    if (isDetecting) {
      animationRef.current = requestAnimationFrame(renderLoop);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isDetecting, renderLoop]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
        <Webcam
          audio={false}
          width={WIDTH}
          height={HEIGHT}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          className="rounded-2xl"
          videoConstraints={{ width: WIDTH, height: HEIGHT, facingMode: 'user' }}
        />
        
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 rounded-2xl"
          style={{ width: WIDTH, height: HEIGHT }}
        />
        
        {isPinchActive && (
          <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full">
            <Music className="w-4 h-4 text-green-400 animate-pulse" />
            <span className="text-green-400 font-mono text-sm">
              {currentFrequency}Hz
            </span>
          </div>
        )}
        
        {isPinchActive && (
          <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full">
            <Volume2 className="w-4 h-4 text-blue-400" />
            <span className="text-blue-400 font-mono text-sm">
              {currentGain}%
            </span>
          </div>
        )}
        
        {!isDetecting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <Button
              onClick={startDetection}
              disabled={isModelLoading}
              size="lg"
              className="gap-2 bg-green-600 hover:bg-green-700 text-white px-8 py-6 text-lg rounded-full"
            >
              <Play className="w-5 h-5" />
              {isModelLoading ? 'Loading Model...' : 'Start Theremin'}
            </Button>
          </div>
        )}
      </div>

      <div className="fixed top-4 left-4 z-50 flex gap-2">
        <AlertDialog open={showAlert} onOpenChange={setShowAlert}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700">
              <TriangleAlert className="w-4 h-4 text-yellow-500" />
              Status
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-100">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <TriangleAlert className="w-5 h-5 text-yellow-500" />
                Performance Note
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                This app now uses CPU-based processing for better cross-browser compatibility.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <p className="text-slate-300">
              Use your <span className="text-green-400">right hand</span> to control pitch and volume.
              Pinch thumb and index finger together to activate sound.
            </p>
            <AlertDialogFooter>
              <AlertDialogAction className="bg-green-600 hover:bg-green-700">Got it!</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700">
              <Info className="w-4 h-4" />
              About
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-800 text-slate-100">
            <DialogHeader>
              <DialogTitle>Virtual Theremin</DialogTitle>
              <DialogDescription className="text-slate-400">
                AI-Powered Musical Instrument
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-slate-300">
              <p>
                A Virtual Theremin app powered by Google&apos;s MediaPipe hand detection.
              </p>
              <div className="bg-slate-800/50 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-green-400">Controls:</h4>
                <ul className="space-y-1 text-sm">
                  <li>• <span className="text-green-400">Right Hand</span> - Pinch thumb & index to activate</li>
                  <li>• <span className="text-green-400">X Position</span> - Controls pitch (left=low, right=high)</li>
                  <li>• <span className="text-blue-400">Y Position</span> - Controls volume</li>
                </ul>
              </div>
              <p className="text-sm text-slate-400">
                Built with Next.js, MediaPipe, and Web Audio API.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
