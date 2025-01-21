"use client";

import { useEffect, useRef, useState } from "react";

import Webcam from "react-webcam";

import {
  HeroUIProvider,
  useDisclosure,
  Button,
  Link,
  Modal,
  ModalHeader,
  ModalBody,
  ModalContent
} from "@heroui/react";

import {
  FilesetResolver,
  GestureRecognizer,
  NormalizedLandmark,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

const WIDTH = 1280;
const HEIGHT = 720;
const INDEX_THUMB_TIP = 4;
const INDEX_INDEX_FINGER_TIP = 8;

// const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));


export default function App() {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const webcamRef = useRef<Webcam>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Recognize variable from the mediapipe task-vision library
  const [recognizer, setRecognizer] = useState<GestureRecognizer>();
  const [canvasSize, setCanvasSize] = useState([0, 0]);
  // const [oscillator, setOscillator] = useState<>(null);

  async function loadRecognizer() {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    const gestureRecognizer = await GestureRecognizer.createFromOptions(
      vision,
      {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task",
          delegate: "GPU",
        },
        numHands: 1,
        runningMode: "VIDEO",
      }
    );
    setCanvasSize([WIDTH, HEIGHT]);
    setRecognizer(gestureRecognizer);
  }

  function renderLoop() {
    if (
      !recognizer ||
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
    const result = recognizer.recognizeForVideo(
      webcamRef.current.video,
      Date.now()
    );
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
    drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, {
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

    const dx = (thumbTip.x - indexFingerTip.x) * width;
    const dy = (thumbTip.y - indexFingerTip.y) * height;

    const connected = dx < 50 && dy < 50;
    return connected;
  };

  const calcFrequency = (
    landmarks: NormalizedLandmark[]
  ) => {
    const minFrequency = 10;
    const maxFrequency = 2500;
    const thumbTip = landmarks[INDEX_THUMB_TIP];
    return ((thumbTip.x) * maxFrequency) + minFrequency;
  };

  const calcGain = (
    landmarks: NormalizedLandmark[]
  ) => {
    const minGain = 0;
    const maxGain = 1;
    const thumbTip = landmarks[INDEX_THUMB_TIP];
    return 1 - ((thumbTip.y) * maxGain) + minGain;
  };

  const makeSound = (
    frequency: number,
    gain: number
  ) => {
    console.log("Frequency:", frequency, "Gain:", gain * 100);
    // create the context and oscillator
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    oscillator.connect(context.destination);
    // create gain node and connect to the destination (audio output device / speakers)
    const gainNode = context.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.frequency.value = frequency;
    gainNode.gain.setTargetAtTime(gain, context.currentTime, 0.01);
    // create the sound
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.01);
    // oscillator.disconnect();
  };

  // Make the recognizer loaded, when first time users open the website
  useEffect(() => {
    loadRecognizer();
  }, []);

  return (
    <HeroUIProvider>
      <div className="flex flex-col items-center min-h-screen p-8 w-full justify-center bg-gradient-to-tr from-black to-[#10182f]">
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
        {recognizer && (
          <Button
            className="fixed top-2 left-2 z-10"
            onPress={() => {
              renderLoop();
            }}
          >
            Detect
          </Button>
        )}
        <Button
          onPress={onOpen}
          className={"fixed top-2 right-2 z-50"}
          color="primary"
          variant="shadow"
        >
          About
        </Button>
        <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
          <ModalContent className={"bg-[#100a43]"}>
            <ModalHeader className="flex flex-col gap-1">About</ModalHeader>
            <ModalBody>
              <h1>Virtual Theremin</h1>
              <p>
                My new app to detect hand gestures and create music from those gestures.
              </p>
              <p>
                <Link href="https://www.anuragshenoy.in/">
                  My personal website
                </Link>
              </p>
            </ModalBody>
          </ModalContent>
        </Modal>
      </div>
    </HeroUIProvider>
  );
}
