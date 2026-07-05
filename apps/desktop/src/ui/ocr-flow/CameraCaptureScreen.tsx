import { useRef, useState, useEffect, useCallback } from "react";
import Card from "../../components/common/Card";
import Button from "../../components/common/Button";
import { isTauri } from "../../lib/isTauri";

type CameraDevice = {
  deviceId: string;
  label: string;
};

type Props = {
  onCapture: (imageSrc: string) => void;
  onSkipCamera?: () => void;
};

export default function CameraCaptureScreen({ onCapture, onSkipCamera }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const enumerateCameras = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices
        .filter((d) => d.kind === "videoinput")
        .map((d) => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 8)}` }));
      setDevices(videoDevices);
      if (videoDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevices[0]!.deviceId);
      }
    } catch {
      setError("Could not enumerate camera devices");
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    enumerateCameras();
  }, [enumerateCameras]);

  const startCamera = useCallback(async () => {
    setError(null);
    stopStream();
    try {
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setCapturedImage(null);
      setCameraReady(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Camera access denied";
      setError(`Camera error: ${message}`);
    }
  }, [selectedDeviceId]);

  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setCameraReady(false);
  }, [stream]);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  const handleCapture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedImage(dataUrl);
    stopStream();
  }, [stopStream]);

  const handleRetake = useCallback(() => {
    setCapturedImage(null);
    startCamera();
  }, [startCamera]);

  const handleConfirmCapture = useCallback(() => {
    if (capturedImage) {
      onCapture(capturedImage);
    }
  }, [capturedImage, onCapture]);

  if (isTauri()) {
    return (
      <div className="space-y-6">
        <Card title="Select Image File">
          <p className="mb-4 text-sm text-gray-600">
            The desktop app supports file selection. Click below to choose a passport/ID image.
          </p>
          <Button onClick={() => onCapture("tauri")}>Select Image File</Button>
          {onSkipCamera && (
            <Button variant="ghost" className="ml-2" onClick={onSkipCamera}>
              Cancel
            </Button>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card title="Capture Passport / ID">
        {!cameraReady && !capturedImage && (
          <div className="space-y-4">
            {devices.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Camera</label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button onClick={startCamera}>Open Camera</Button>
            {onSkipCamera && (
              <Button variant="ghost" className="ml-2" onClick={onSkipCamera}>
                Skip Camera
              </Button>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        {cameraReady && !capturedImage && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-lg border-2 border-dashed border-gray-300 bg-black">
              <video ref={videoRef} autoPlay playsInline className="mx-auto max-h-[60vh] w-full object-contain" />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCapture}>Capture Photo</Button>
              <Button variant="secondary" onClick={stopStream}>
                Close Camera
              </Button>
            </div>
          </div>
        )}

        {capturedImage && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-lg border-2 border-green-300">
              <img
                src={capturedImage}
                alt="Captured passport/ID"
                className="mx-auto max-h-[60vh] w-full object-contain"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleConfirmCapture}>Use This Photo</Button>
              <Button variant="secondary" onClick={handleRetake}>
                Retake
              </Button>
            </div>
          </div>
        )}
      </Card>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
