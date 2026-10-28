"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLineIcon } from "lucide-react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";

type DetectorLike = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts?: { formats?: string[] }) => DetectorLike;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

/** 카메라로 바코드를 읽어 onScan(코드)을 호출. USB 스캐너는 입력창에 그대로 입력하면 된다. */
export default function BarcodeScanButton({ onScan, label = "카메라 스캔" }: { onScan: (code: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="shrink-0">
        <ScanLineIcon /> {label}
      </Button>
      {open && (
        <ScanDialog
          onClose={() => setOpen(false)}
          onDetect={(code) => {
            setOpen(false);
            onScan(code);
          }}
        />
      )}
    </>
  );
}

function ScanDialog({ onClose, onDetect }: { onClose: () => void; onDetect: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const detectRef = useRef(onDetect);
  useEffect(() => {
    detectRef.current = onDetect;
  });

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let stopZxing: (() => void) | null = null;
    const done = (code: string) => {
      if (stopped) return;
      stopped = true;
      detectRef.current(code);
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("이 브라우저는 카메라를 지원하지 않거나 HTTPS 연결이 아닙니다. USB 스캐너를 사용하거나 코드를 직접 입력하세요.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
      } catch {
        setError("카메라 권한이 거부되었거나 카메라를 찾을 수 없습니다. 브라우저 설정에서 카메라를 허용하세요.");
        return;
      }
      const video = videoRef.current;
      if (!video || stopped) {
        stream.getTracks().forEach((t) => t.stop()); // 권한 승인 전에 창이 닫힌 경우 카메라를 끈다
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});

      const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (Native) {
        const detector = new Native({ formats: FORMATS });
        const tick = async () => {
          if (stopped) return;
          try {
            const found = await detector.detect(video);
            if (found[0]?.rawValue) return done(found[0].rawValue);
          } catch {
            /* 프레임 일시 오류는 무시하고 계속 */
          }
          setTimeout(tick, 150);
        };
        tick();
      } else {
        // BarcodeDetector 미지원 브라우저(Firefox, Windows Chrome 등): zxing 폴백
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromStream(stream, video, (result) => {
          if (result) done(result.getText());
        });
        stopZxing = () => controls.stop();
        if (stopped) stopZxing();
      }
    }
    start();

    return () => {
      stopped = true;
      stopZxing?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <Modal title="바코드 스캔" onClose={onClose} maxWidth="max-w-md">
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <>
          <video ref={videoRef} className="aspect-[4/3] w-full rounded-lg bg-black object-cover" muted playsInline />
          <p className="text-xs text-gray-500">바코드를 화면 가운데에 맞추면 자동으로 인식됩니다.</p>
        </>
      )}
    </Modal>
  );
}
