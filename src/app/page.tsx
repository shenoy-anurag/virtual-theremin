"use client";

import { useEffect, useRef, useState } from "react";

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
import { TriangleAlert } from "lucide-react";

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

// const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));


export default function App() {
  const webcamRef = useRef<Webcam>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Recognize variable from the mediapipe task-vision library
  // const [recognizer, setRecognizer] = useState<GestureRecognizer>();
  const [landmarker, setLandmarker] = useState<HandLandmarker>();
  const [canvasSize, setCanvasSize] = useState([0, 0]);
  const [isVisibleAlert, setIsVisibleAlert] = useState(true);
  // const [oscillator, setOscillator] = useState<>(null);

  async function loadRecognizer() {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    const handLandmarker = await HandLandmarker.createFromOptions(
      vision,
      {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        numHands: 1,
        runningMode: "VIDEO",
        // runningMode: "LIVE_STREAM",
      }
    );
    setCanvasSize([WIDTH, HEIGHT]);
    setLandmarker(handLandmarker);
  }

  async function renderLoop() {
    if (
      !landmarker ||
      !webcamRef.current ||
      !webcamRef.current.video ||
      !webcamRef.current ||
      !canvasRef.current
    ) {
      return;
    }

    webcamRef.current.video.width = WIDTH;
    webcamRef.current.video.height = HEIGHT;

    const canvasEl = canvasRef.current;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    canvasEl.width = WIDTH;
    canvasEl.height = HEIGHT;

    // Get prediction results from the MediaPipe hand for the current video frame.
    const result = landmarker.detectForVideo(webcamRef.current.video, Date.now())
    if (result.landmarks) {
      const width = canvasEl.width;
      const height = canvasEl.height;
      if (result.landmarks.length === 0) {
        ctx.clearRect(0, 0, width, height);
      } else {
        result.landmarks.forEach((landmarks) => {
          const isConnected = detectPinch(landmarks, WIDTH, HEIGHT);
          if (isConnected) {
            const frequency = calcFrequency(landmarks);
            const gain = calcGain(landmarks);
            // console.log(frequency, gain);
            makeSound(frequency, gain);
          }
          drawHandLandmarks(
            landmarks,
            ctx,
            width,
            height
          );
        });
      }
    }
    // continuously call the renderLoop function to update the mediapipe predictions in real-time.
    requestAnimationFrame(renderLoop);
  };

  const drawHandLandmarks = (
    landmarks: NormalizedLandmark[],
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => {
    const drawingUtils = new DrawingUtils(ctx);
    ctx.clearRect(0, 0, width, height);
    drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
      color: "#00FF00",
      lineWidth: 2,
    });
    drawingUtils.drawLandmarks(landmarks, {
      color: "#FF0000",
      lineWidth: 1,
    });
  };

  const detectPinch = (
    landmarks: NormalizedLandmark[],
    width: number,
    height: number,
  ) => {
    const thumbTip = landmarks[INDEX_THUMB_TIP];
    const indexFingerTip = landmarks[INDEX_INDEX_FINGER_TIP];
    // console.log(thumbTip.x, thumbTip.y);

    const dx = (thumbTip.x - indexFingerTip.x) * width;
    const dy = (thumbTip.y - indexFingerTip.y) * height;

    const connected = dx < 100 && dy < 100;
    return connected;
  };

  const calcFrequency = (
    landmarks: NormalizedLandmark[]
  ) => {
    const minFrequency = 10;
    const maxFrequency = 2500;
    const thumbTip = landmarks[INDEX_THUMB_TIP];
    return (thumbTip.x * (maxFrequency -minFrequency)) + minFrequency;
  };

  const calcGain = (
    landmarks: NormalizedLandmark[]
  ) => {
    const minGain = 0;
    const maxGain = 1;
    const thumbTip = landmarks[INDEX_THUMB_TIP];
    return ((1 - thumbTip.y) * (maxGain - minGain)) + minGain;
  };

  const makeSound = (
    frequency: number,
    gain: number
  ) => {
    // console.log("Frequency:", frequency, "Gain:", gain * 100);
    // create the context and oscillator
    const audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.connect(audioCtx.destination);
    // create gain node and connect to the destination (audio output device / speakers)
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(gain, audioCtx.currentTime);
    // create the sound
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.01);
    // oscillator.disconnect();
  };

  // Make the recognizer loaded, when first time users open the website
  useEffect(() => {
    loadRecognizer();
  }, []);

  return (
    <div className="flex flex-col items-center min-h-screen p-8 w-full justify-center bg-linear-to-tr from-black to-[#10182f]">
      <Webcam
        audio={false}
        width={WIDTH}
        height={HEIGHT}
        ref={webcamRef}
        screenshotFormat="image/jpeg"
        className="absolute z-10"
        videoConstraints={{ width: WIDTH, height: HEIGHT, facingMode: 'user' }}
      />
      <canvas
        ref={canvasRef}
        className="absolute z-10"
        width={canvasSize[0] || WIDTH}
        height={canvasSize[1] || HEIGHT}
      />
      {landmarker && (
        <Button
          className="fixed top-2 left-2 z-10"
          onClick={() => {
            renderLoop();
          }}
        >
          Detect
        </Button>
      )}
      <AlertDialog open={isVisibleAlert} onOpenChange={setIsVisibleAlert}>
        <AlertDialogTrigger asChild>
          <Button variant="secondary" className={"fixed top-2 left-32"}>
            Show Alert
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <TriangleAlert className="h-6 w-6 text-yellow-500" />
            <AlertDialogTitle>Works best in Firefox</AlertDialogTitle>
            <AlertDialogDescription>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p>This app works best in Firefox. Performs poorly in Google Chrome and Edge. Currently working on it.</p>
          <p>Click on Instructions to begin.</p>
          <AlertDialogFooter>
            <AlertDialogAction>Okay</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            className={"fixed top-2 right-2 z-50"}
            color="primary"
            variant="secondary"
          >
            About
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>About</DialogTitle>
          </DialogHeader>
          <h1>Virtual Theremin</h1>
          <p>
            A Virtual Theremin app powered by Google&apos;s mediapipe AI hand detection model.
          </p>
          <p>
            For more, check out my personal website:&nbsp;
            <Link href="https://www.anuragshenoy.in/">
              https://www.anuragshenoy.in/
            </Link>
          </p>
          <br></br>
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger asChild>
          <Button
            className={"fixed top-2 z-50"}
            variant="default"
          >
            Instructions
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Instructions</DialogTitle>
            <DialogDescription>
              How to use this app
            </DialogDescription>
          </DialogHeader>
          <p>
            To start detection of hands, click on &quot;Detect&quot;.
          </p>
          <p>
            Pinching your Index Finger and Thumb together activates the Theremin.
          </p>
          <p>
            Frequency varies from LOW to HIGH pitch from LEFT to RIGHT.
          </p>
          <p>
            Gain / Volume varies from LOW to HIGH from BOTTOM to TOP.
          </p>
          <br></br>
        </DialogContent>
      </Dialog>

    </div>
  );
}
