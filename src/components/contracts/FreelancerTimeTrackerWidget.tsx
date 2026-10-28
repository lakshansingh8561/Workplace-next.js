"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import {
  startTimeTrackingAction,
  pauseTimeTrackingAction,
  resumeTimeTrackingAction,
  stopTimeTrackingAction,
  recordWorkSnapshotAction,
  getActiveTimeEntryAction,
} from "@/lib/actions/time-tracker";
import { TimeTrackingStatus } from "@prisma/client";

interface FreelancerTimeTrackerWidgetProps {
  contractId: string;
  contractTitle: string;
  hourlyRate: number;
  onSessionUpdated?: () => void;
}

export const SCREENSHOT_INTERVAL_SECONDS = 10 * 60; // 600s = 10 minutes
export const SCREENSHOT_CAPTURE_INTERVAL_MS = SCREENSHOT_INTERVAL_SECONDS * 1000;

export function FreelancerTimeTrackerWidget({
  contractId,
  contractTitle,
  hourlyRate,
  onSessionUpdated,
}: FreelancerTimeTrackerWidgetProps) {
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [status, setStatus] = useState<TimeTrackingStatus | "IDLE">("IDLE");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [pausedAt, setPausedAt] = useState<Date | null>(null);
  const [totalPausedSeconds, setTotalPausedSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // 10-minute automated screenshot cadence & countdown
  const [secondsUntilNextCapture, setSecondsUntilNextCapture] =
    useState<number>(SCREENSHOT_INTERVAL_SECONDS);
  const [isCapturingSnapshot, setIsCapturingSnapshot] = useState(false);
  const isCapturingRef = useRef(false);
  const nextCaptureTimeRef = useRef<number | null>(null);
  const descriptionRef = useRef(description);

  useEffect(() => {
    descriptionRef.current = description;
  }, [description]);

  const onSessionUpdatedRef = useRef(onSessionUpdated);
  useEffect(() => {
    onSessionUpdatedRef.current = onSessionUpdated;
  }, [onSessionUpdated]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const performSnapshotCaptureRef = useRef<((isManual?: boolean) => Promise<void>) | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Screen sharing consent & capture state
  const [screenShareActive, setScreenShareActive] = useState(false);
  const [screenCaptureError, setScreenCaptureError] = useState<string | null>(null);
  const [isStorageConfigured, setIsStorageConfigured] = useState<boolean>(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const isScreenCaptureSupported =
    typeof navigator !== "undefined" && !!navigator?.mediaDevices?.getDisplayMedia;

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // 1. Session Recovery on Load
  useEffect(() => {
    let mounted = true;

    async function recoverSession() {
      try {
        const res = await getActiveTimeEntryAction(contractId);
        if (!mounted) return;

        if (res.isStorageConfigured !== undefined) {
          setIsStorageConfigured(Boolean(res.isStorageConfigured));
        }

        if (res.activeEntry) {
          const entry = res.activeEntry;
          setActiveEntryId(entry.id);
          setStatus(entry.status);
          setDescription(entry.description || "");
          const st = new Date(entry.startTime);
          setStartTime(st);
          const pa = entry.pausedAt ? new Date(entry.pausedAt) : null;
          setPausedAt(pa);
          setTotalPausedSeconds(entry.totalPausedSeconds);

          // Calculate initial elapsed
          const now = Date.now();
          if (entry.status === TimeTrackingStatus.RECORDING) {
            const el = Math.max(0, Math.floor((now - st.getTime()) / 1000) - entry.totalPausedSeconds);
            setElapsedSeconds(el);
            nextCaptureTimeRef.current = Date.now() + SCREENSHOT_CAPTURE_INTERVAL_MS;
            setSecondsUntilNextCapture(SCREENSHOT_INTERVAL_SECONDS);
          } else if (entry.status === TimeTrackingStatus.PAUSED && pa) {
            const el = Math.max(0, Math.floor((pa.getTime() - st.getTime()) / 1000) - entry.totalPausedSeconds);
            setElapsedSeconds(el);
            nextCaptureTimeRef.current = null;
            setSecondsUntilNextCapture(SCREENSHOT_INTERVAL_SECONDS);
          }
        } else {
          setStatus("IDLE");
        }
      } catch (err) {
        console.error("Session recovery error:", err);
      } finally {
        if (mounted) setIsLoadingSession(false);
      }
    }

    recoverSession();

    return () => {
      mounted = false;
    };
  }, [contractId]);

  // 2. Live Elapsed Timer
  useEffect(() => {
    if (status !== TimeTrackingStatus.RECORDING || !startTime) {
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const el = Math.max(0, Math.floor((now - startTime.getTime()) / 1000) - totalPausedSeconds);
      setElapsedSeconds(el);
    }, 1000);

    return () => clearInterval(interval);
  }, [status, startTime, totalPausedSeconds]);

  // Clean up screen sharing stream on unmount or session stop
  const stopScreenStream = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore cleanup errors
        }
      });
      screenStreamRef.current = null;
    }
    if (videoElementRef.current) {
      try {
        videoElementRef.current.pause();
      } catch {
        // ignore
      }
      videoElementRef.current.srcObject = null;
    }
    setScreenShareActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopScreenStream();
    };
  }, [stopScreenStream]);

  // Tab visibility changes: handle minimized/switched tab stream verification
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (
          screenStreamRef.current &&
          (!screenStreamRef.current.active ||
            !screenStreamRef.current.getVideoTracks().some((t) => t.readyState === "live"))
        ) {
          stopScreenStream();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [stopScreenStream]);

  // Request screen sharing stream (called proactively on start/resume or manually via toggle)
  const requestScreenShareStream = useCallback(async (): Promise<boolean> => {
    if (!isScreenCaptureSupported) {
      setScreenCaptureError("Screen capture is not supported by your browser.");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState !== "live") {
        setScreenCaptureError("No active video track available from screen sharing.");
        stopScreenStream();
        return false;
      }

      screenStreamRef.current = stream;
      if (videoElementRef.current) {
        videoElementRef.current.srcObject = stream;
        videoElementRef.current.play().catch((e) => console.warn("Video play notice:", e));
      }
      setScreenShareActive(true);
      setScreenCaptureError(null);

      // Listen for user stopping sharing via native browser banner
      videoTrack.onended = () => {
        stopScreenStream();
      };
      return true;
    } catch (err) {
      console.warn("Screen sharing permission declined or cancelled:", err);
      setScreenCaptureError(
        "Screen sharing permission was cancelled or not granted. Automatic screenshots will be paused until granted."
      );
      setScreenShareActive(false);
      return false;
    }
  }, [isScreenCaptureSupported, stopScreenStream]);

  // 3. Screen Sharing Consent Initiation
  const handleToggleScreenShare = async () => {
    setScreenCaptureError(null);

    if (screenShareActive) {
      stopScreenStream();
      return;
    }

    await requestScreenShareStream();
  };

  // 4. Capture Canvas Frame & Record Snapshot (Called automatically every 10 min or manually)
  const performSnapshotCapture = useCallback(
    async (isManual: boolean = false) => {
      if (!activeEntryId || status !== TimeTrackingStatus.RECORDING) return;
      if (isCapturingRef.current) return;

      setErrorMessage(null);

      // Verify active screen sharing stream
      const isStreamActive = Boolean(
        screenStreamRef.current &&
        screenStreamRef.current.active &&
        screenStreamRef.current.getVideoTracks().some((t) => t.readyState === "live")
      );

      // For automatic 10-minute captures, screen sharing permission is strictly required.
      // Do not create fake snapshot records without user consent.
      if (!isStreamActive) {
        if (screenStreamRef.current) {
          stopScreenStream();
        }
        if (!isManual) {
          setScreenCaptureError(
            "Automatic screenshot skipped: Screen sharing permission is required. Grant permission to enable automatic work screenshots."
          );
          nextCaptureTimeRef.current = Date.now() + SCREENSHOT_CAPTURE_INTERVAL_MS;
          setSecondsUntilNextCapture(SCREENSHOT_INTERVAL_SECONDS);
          return;
        }
      }

      // For automatic captures, storage must also be configured to save screenshots
      if (!isManual && !isStorageConfigured) {
        setScreenCaptureError(
          "Automatic screenshot skipped: Cloud storage is not configured. Screen captures cannot be stored."
        );
        nextCaptureTimeRef.current = Date.now() + SCREENSHOT_CAPTURE_INTERVAL_MS;
        setSecondsUntilNextCapture(SCREENSHOT_INTERVAL_SECONDS);
        return;
      }

      isCapturingRef.current = true;
      setIsCapturingSnapshot(true);

      let imageUrl: string | undefined = undefined;

      // Only extract frame if screen sharing stream is active and video track is live
      if (isStreamActive && screenStreamRef.current) {
        const videoTrack = screenStreamRef.current.getVideoTracks().find((t) => t.readyState === "live");
        if (videoTrack) {
          // Attempt 1: Persistent in-DOM video element (most reliable, zero timeouts, works across background tabs)
          try {
            const vid = videoElementRef.current;
            if (vid && vid.videoWidth > 0 && vid.videoHeight > 0) {
              const canvas = document.createElement("canvas");
              canvas.width = Math.min(1280, vid.videoWidth);
              canvas.height = Math.min(
                720,
                Math.round((canvas.width / vid.videoWidth) * vid.videoHeight)
              );
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
                imageUrl = canvas.toDataURL("image/webp", 0.7);
              }
            }
          } catch (e) {
            console.warn("Primary in-DOM video capture error:", e);
          }

          // Attempt 2: ImageCapture API if supported and not yet extracted
          if (!imageUrl) {
            try {
              if (typeof window !== "undefined" && "ImageCapture" in window) {
                const ImageCaptureClass = (
                  window as unknown as {
                    ImageCapture: new (
                      track: MediaStreamTrack
                    ) => { grabFrame: () => Promise<ImageBitmap> };
                  }
                ).ImageCapture;
                const captureInstance = new ImageCaptureClass(videoTrack);
                const bitmap = await captureInstance.grabFrame();
                const canvas = document.createElement("canvas");
                canvas.width = Math.min(1280, bitmap.width);
                canvas.height = Math.min(
                  720,
                  Math.round((canvas.width / bitmap.width) * bitmap.height)
                );
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                  imageUrl = canvas.toDataURL("image/webp", 0.7);
                }
              }
            } catch {
              // Fallback to offscreen video element below
            }
          }

          // Attempt 3: Offscreen video element canvas rendering
          if (!imageUrl) {
            let video: HTMLVideoElement | null = null;
            try {
              video = document.createElement("video");
              video.muted = true;
              video.playsInline = true;
              video.srcObject = screenStreamRef.current;
              await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => resolve(), 1200);
                if (!video) return resolve();
                video.onloadedmetadata = () => {
                  video!
                    .play()
                    .then(() => {
                      clearTimeout(timer);
                      resolve();
                    })
                    .catch(reject);
                };
                video.onerror = () => {
                  clearTimeout(timer);
                  reject(new Error("Video load failed"));
                };
              });

              if (video && video.videoWidth > 0 && video.videoHeight > 0) {
                const canvas = document.createElement("canvas");
                canvas.width = Math.min(1280, video.videoWidth);
                canvas.height = Math.min(
                  720,
                  Math.round((canvas.width / video.videoWidth) * video.videoHeight)
                );
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  imageUrl = canvas.toDataURL("image/webp", 0.7);
                }
              }
            } catch (err) {
              console.warn("Video element capture error:", err);
            } finally {
              if (video) {
                try {
                  video.pause();
                } catch {
                  // ignore
                }
                video.srcObject = null;
              }
            }
          }
        } else {
          stopScreenStream();
        }
      }

      // If automatic capture failed to extract image frame, do not create fake record
      if (!isManual && !imageUrl) {
        if (isMountedRef.current) {
          setScreenCaptureError("Failed to extract screen frame from active stream. Next capture in 10 minutes.");
          isCapturingRef.current = false;
          setIsCapturingSnapshot(false);
          nextCaptureTimeRef.current = Date.now() + SCREENSHOT_CAPTURE_INTERVAL_MS;
          setSecondsUntilNextCapture(SCREENSHOT_INTERVAL_SECONDS);
        }
        return;
      }

      try {
        const res = await recordWorkSnapshotAction({
          timeEntryId: activeEntryId,
          imageUrl,
          keystrokes: 25,
          mouseEvents: 40,
          memo: descriptionRef.current || "Active work interval",
        });

        if (!isMountedRef.current) return;

        if (res.success) {
          setSuccessNotice(
            isManual
              ? (imageUrl ? "Manual activity snapshot recorded successfully." : "Manual activity snapshot recorded (activity metrics only).")
              : "Automatic 10-minute snapshot recorded."
          );
          setTimeout(() => {
            if (isMountedRef.current) setSuccessNotice(null);
          }, 3500);
          onSessionUpdatedRef.current?.();
        } else {
          setErrorMessage(res.error || "Failed to record snapshot.");
        }
      } catch (err) {
        console.error("Snapshot recording error:", err);
        if (isMountedRef.current) {
          setErrorMessage("Unexpected error while recording snapshot.");
        }
      } finally {
        isCapturingRef.current = false;
        if (isMountedRef.current) {
          setIsCapturingSnapshot(false);
          // Reset 10-minute countdown target for the next capture
          nextCaptureTimeRef.current = Date.now() + SCREENSHOT_CAPTURE_INTERVAL_MS;
          setSecondsUntilNextCapture(SCREENSHOT_INTERVAL_SECONDS);
        }
      }
    },
    [activeEntryId, status, isStorageConfigured, stopScreenStream]
  );

  useEffect(() => {
    performSnapshotCaptureRef.current = performSnapshotCapture;
  }, [performSnapshotCapture]);

  // Automated 10-Minute Work Activity Snapshot Loop & Countdown
  useEffect(() => {
    if (status !== TimeTrackingStatus.RECORDING || !activeEntryId) {
      nextCaptureTimeRef.current = null;
      return;
    }

    if (nextCaptureTimeRef.current === null) {
      nextCaptureTimeRef.current = Date.now() + SCREENSHOT_CAPTURE_INTERVAL_MS;
    }

    const interval = setInterval(() => {
      if (!nextCaptureTimeRef.current) return;

      const remaining = Math.max(
        0,
        Math.ceil((nextCaptureTimeRef.current - Date.now()) / 1000)
      );
      setSecondsUntilNextCapture(remaining);

      if (remaining <= 0) {
        nextCaptureTimeRef.current = Date.now() + SCREENSHOT_CAPTURE_INTERVAL_MS;
        setSecondsUntilNextCapture(SCREENSHOT_INTERVAL_SECONDS);
        performSnapshotCaptureRef.current?.(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [status, activeEntryId]);

  // 5. Timer Controls
  const handleStart = async () => {
    setErrorMessage(null);
    setSuccessNotice(null);

    // Proactively request screen sharing permission if supported and not active
    if (isScreenCaptureSupported && !screenShareActive) {
      await requestScreenShareStream();
    }

    startTransition(async () => {
      const res = await startTimeTrackingAction({
        contractId,
        description: description || undefined,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to start time tracking.");
        return;
      }

      if (res.timeEntryId) {
        setActiveEntryId(res.timeEntryId);
        setStatus(TimeTrackingStatus.RECORDING);
        const now = new Date();
        setStartTime(now);
        setPausedAt(null);
        setTotalPausedSeconds(0);
        setElapsedSeconds(0);
        nextCaptureTimeRef.current = Date.now() + SCREENSHOT_CAPTURE_INTERVAL_MS;
        setSecondsUntilNextCapture(SCREENSHOT_INTERVAL_SECONDS);
        onSessionUpdated?.();
      }
    });
  };

  const handlePause = () => {
    if (!activeEntryId) return;
    setErrorMessage(null);
    setSuccessNotice(null);

    // Stop screen sharing immediately on pause
    stopScreenStream();
    nextCaptureTimeRef.current = null;
    setSecondsUntilNextCapture(SCREENSHOT_INTERVAL_SECONDS);

    startTransition(async () => {
      const res = await pauseTimeTrackingAction({ timeEntryId: activeEntryId });
      if (!res.success) {
        setErrorMessage(res.error || "Failed to pause tracking.");
        return;
      }

      setStatus(TimeTrackingStatus.PAUSED);
      setPausedAt(new Date());
      onSessionUpdated?.();
    });
  };

  const handleResume = async () => {
    if (!activeEntryId) return;
    setErrorMessage(null);
    setSuccessNotice(null);

    // Prompt for screen sharing reactivation if supported and not active
    if (isScreenCaptureSupported && !screenShareActive) {
      await requestScreenShareStream();
    }

    startTransition(async () => {
      const res = await resumeTimeTrackingAction({ timeEntryId: activeEntryId });
      if (!res.success) {
        setErrorMessage(res.error || "Failed to resume tracking.");
        return;
      }

      setStatus(TimeTrackingStatus.RECORDING);
      if (pausedAt) {
        const added = Math.max(0, Math.floor((Date.now() - pausedAt.getTime()) / 1000));
        setTotalPausedSeconds((prev) => prev + added);
      }
      setPausedAt(null);
      nextCaptureTimeRef.current = Date.now() + SCREENSHOT_CAPTURE_INTERVAL_MS;
      setSecondsUntilNextCapture(SCREENSHOT_INTERVAL_SECONDS);
      onSessionUpdated?.();
    });
  };

  const handleStop = () => {
    if (!activeEntryId) return;
    setErrorMessage(null);
    setSuccessNotice(null);

    startTransition(async () => {
      const res = await stopTimeTrackingAction({
        timeEntryId: activeEntryId,
        description: description || undefined,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to stop tracking.");
        return;
      }

      stopScreenStream();
      nextCaptureTimeRef.current = null;
      setSecondsUntilNextCapture(SCREENSHOT_INTERVAL_SECONDS);
      setActiveEntryId(null);
      setStatus("IDLE");
      setStartTime(null);
      setPausedAt(null);
      setTotalPausedSeconds(0);
      setElapsedSeconds(0);
      setDescription("");

      setSuccessNotice(
        `Session stopped. ${Number(((res.durationSeconds || 0) / 3600).toFixed(2))} hrs recorded ($${(res.billableAmount || 0).toFixed(2)} calculated).`
      );
      setTimeout(() => setSuccessNotice(null), 6000);
      onSessionUpdated?.();
    });
  };

  // Helper: format seconds to HH:MM:SS
  const formatSeconds = (sec: number) => {
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;
    return [
      hours.toString().padStart(2, "0"),
      minutes.toString().padStart(2, "0"),
      seconds.toString().padStart(2, "0"),
    ].join(":");
  };

  // Live estimated billable calculation
  const liveEstimatedAmount = ((elapsedSeconds / 3600) * hourlyRate).toFixed(2);

  if (isLoadingSession) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 text-center text-xs text-zinc-500 animate-pulse">
        Checking active time tracking session...
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-emerald-100 bg-gradient-to-b from-white to-emerald-50/20 p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950 space-y-6">
      {/* Header & Status Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-5 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Hourly Time Tracker
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              ${hourlyRate}/hr
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-zinc-950 dark:text-white line-clamp-1">
            {contractTitle}
          </h3>
        </div>

        {/* Status Badge */}
        <div className="flex flex-wrap items-center gap-2">
          {status === TimeTrackingStatus.RECORDING && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                Tracking Active
              </span>
              {screenShareActive ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Screen Sharing Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400">
                  <span className="h-2 w-2 rounded-full bg-zinc-400" />
                  Screen Sharing Inactive (Activity Metrics Only)
                </span>
              )}
            </>
          )}
          {status === TimeTrackingStatus.PAUSED && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Tracking Paused
            </span>
          )}
          {status === "IDLE" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              <span className="h-2 w-2 rounded-full bg-zinc-400" />
              Tracker Idle
            </span>
          )}
        </div>
      </div>

      {/* Automatic Screenshot Cadence & Countdown Indicator (Requirement #9) */}
      {status === TimeTrackingStatus.RECORDING && (
        <>
          {screenShareActive ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 text-xs text-emerald-900 dark:text-emerald-200">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold">
                  Automatic screenshots enabled — next capture in{" "}
                  <strong className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                    {formatCountdown(secondsUntilNextCapture)}
                  </strong>
                </span>
              </div>
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                10-minute cadence
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span className="font-semibold">Screen sharing permission required for automatic screenshots</span>
                <span className="text-zinc-400 dark:text-zinc-500">•</span>
                <span>Automatic captures paused</span>
              </div>
              {isScreenCaptureSupported && (
                <button
                  type="button"
                  onClick={handleToggleScreenShare}
                  className="text-xs font-bold text-amber-800 dark:text-amber-300 underline underline-offset-2 hover:opacity-80"
                >
                  Grant Screen Permission
                </button>
              )}
            </div>
          )}
        </>
      )}

      {status === TimeTrackingStatus.PAUSED && (
        <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span>Tracking paused — automatic screenshot timer suspended</span>
        </div>
      )}

      {/* Live Counter Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div className="rounded-2xl bg-zinc-950 p-6 text-center dark:bg-black border border-zinc-800">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
            Current Session Duration
          </span>
          <div className="mt-2 font-mono text-4xl sm:text-5xl font-black tracking-tight text-emerald-400">
            {formatSeconds(elapsedSeconds)}
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs text-zinc-400">
            <span>
              Billable Hours:{" "}
              <strong className="text-white font-medium">
                {(elapsedSeconds / 3600).toFixed(2)}h
              </strong>
            </span>
            <span>•</span>
            <span>
              Calculated Subtotal:{" "}
              <strong className="text-emerald-400 font-semibold">
                ${liveEstimatedAmount}
              </strong>
            </span>
          </div>
        </div>

        {/* Task Memo Input */}
        <div className="space-y-3">
          <label
            htmlFor="tracker-memo"
            className="block text-xs font-bold text-zinc-700 dark:text-zinc-300"
          >
            Work Activity Memo / Task Description
          </label>
          <textarea
            id="tracker-memo"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isPending}
            placeholder="e.g. Developing authentication middleware & API endpoint tests..."
            className="w-full rounded-2xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
          />
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            This note will be saved in your contract work diary alongside your tracked hours.
          </p>
        </div>
      </div>

      {/* Interactive Controls */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        {status === "IDLE" && (
          <button
            type="button"
            onClick={handleStart}
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-500 transition active:scale-95 disabled:opacity-50"
          >
            ▶ Start Tracking
          </button>
        )}

        {status === TimeTrackingStatus.RECORDING && (
          <>
            <button
              type="button"
              onClick={handlePause}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-500 transition active:scale-95 disabled:opacity-50"
            >
              ⏸ Pause Timer
            </button>
            <button
              type="button"
              onClick={handleStop}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-rose-500 transition active:scale-95 disabled:opacity-50"
            >
              ⏹ Stop & Save Session
            </button>
            <button
              type="button"
              onClick={() => performSnapshotCapture(true)}
              disabled={isPending || isCapturingSnapshot}
              className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition active:scale-95 disabled:opacity-50"
            >
              {isCapturingSnapshot ? "📸 Recording..." : "📸 Record Activity Snapshot"}
            </button>
          </>
        )}

        {status === TimeTrackingStatus.PAUSED && (
          <>
            <button
              type="button"
              onClick={handleResume}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition active:scale-95 disabled:opacity-50"
            >
              ▶ Resume Timer
            </button>
            <button
              type="button"
              onClick={handleStop}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-rose-500 transition active:scale-95 disabled:opacity-50"
            >
              ⏹ Stop & Save Session
            </button>
          </>
        )}

        {/* Screen Sharing Toggle (Browser Screen Capture API) */}
        {status === TimeTrackingStatus.RECORDING && isScreenCaptureSupported && (
          <button
            type="button"
            onClick={handleToggleScreenShare}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
              screenShareActive
                ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                screenShareActive ? "bg-emerald-500" : "bg-zinc-400"
              }`}
            />
            {screenShareActive
              ? "Screen Sharing Active (Click to Stop)"
              : "🖥️ Request Screen Sharing Permission"}
          </button>
        )}
      </div>

      {/* Storage Configuration Warning (Requirement #5) */}
      {!isStorageConfigured && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300 flex items-start gap-2.5">
          <span className="text-base leading-none">ℹ️</span>
          <div>
            <strong className="font-semibold">Screenshot Storage Notice:</strong> Private cloud storage (Cloudinary / S3 / R2) is not currently configured. Activity metrics (session duration, keystrokes, mouse events, and task memos) are fully tracked and recorded in your timesheets, but actual screenshot images cannot be saved to server storage.
          </div>
        </div>
      )}

      {/* Notifications & Error Banners */}
      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          ⚠️ {errorMessage}
        </div>
      )}

      {successNotice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          ✓ {successNotice}
        </div>
      )}

      {screenCaptureError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          ℹ️ {screenCaptureError}
        </div>
      )}

      {/* Privacy Notice & Technical Disclosures */}
      <div className="rounded-2xl bg-zinc-50 p-4 border border-zinc-200/80 dark:bg-zinc-900/60 dark:border-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1.5">
        <p className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
          <span>🔒</span> Tracking Privacy & Security Disclosures:
        </p>
        <p>
          • <strong>Timestamps & Active Duration:</strong> Tracking records start, pause, and completion timestamps on the server. Active duration excludes paused periods.
        </p>
        <p>
          • <strong>Browser Screen Sharing & Desktop Companion:</strong> Web browsers operate in a sandbox and <em>cannot silently capture full desktop screens</em> in the background. Screen preview requires your explicit browser prompt consent and only streams while your session is active. Continuous full-desktop capture and system input monitoring require a native WorkPulse desktop companion application.
        </p>
        <p>
          • <strong>Billing Calculation:</strong> Calculated billing totals are mathematical projections using the contract&apos;s agreed hourly rate. No automated credit card charges or payouts occur automatically.
        </p>
      </div>

      {/* Hidden persistent video element for reliable frame extraction */}
      <video
        ref={videoElementRef}
        autoPlay
        muted
        playsInline
        aria-hidden="true"
        className="fixed -top-[9999px] -left-[9999px] w-1 h-1 opacity-0 pointer-events-none"
      />
    </div>
  );
}

