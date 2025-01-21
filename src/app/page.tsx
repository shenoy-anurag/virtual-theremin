"use client";

import { useEffect, useRef, useState } from "react";

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

export default function App() {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  return (
    <HeroUIProvider>
      <div className="flex flex-col items-center min-h-screen p-8 w-full justify-center bg-gradient-to-tr from-black to-[#10182f]">
        <Button
          onPress={onOpen}
          className={"fixed top-2 right-2 z-50"}
          color="primary"
          variant="shadow"
        >
          About
        </Button>
        <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
          <ModalContent className={"bg-[#10082c]"}>
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
