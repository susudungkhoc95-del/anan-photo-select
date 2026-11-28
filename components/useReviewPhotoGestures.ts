"use client";

import { useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };
type View = Point & { scale: number };
type PhotoSize = Pick<DOMRect, "width" | "height">;
export type ReviewPhotoLayout = { viewport: PhotoSize; image: PhotoSize };
type TouchGesture =
  | { kind: "single"; start: Point; time: number; moved: boolean }
  | { kind: "pan"; start: Point; view: View; time: number | null; moved: boolean }
  | { kind: "pinch"; center: Point; distance: number; view: View };

const fitted: View = { scale: 1, x: 0, y: 0 };
const maxScale = 4;

function point(touch: Touch): Point {
  return { x: touch.clientX, y: touch.clientY };
}

function pinch(touches: TouchList) {
  const first = point(touches[0]);
  const second = point(touches[1]);
  return {
    center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y))
  };
}

function bounded(view: View, bounds: DOMRect, image: DOMRect): View {
  const x = Math.max(0, (image.width * view.scale - bounds.width) / 2);
  const y = Math.max(0, (image.height * view.scale - bounds.height) / 2);
  return { scale: view.scale, x: Math.max(-x, Math.min(x, view.x)), y: Math.max(-y, Math.min(y, view.y)) };
}

function zoomAt(view: View, scale: number, start: Point, end: Point, bounds: DOMRect, image: DOMRect): View {
  scale = Math.max(1, Math.min(maxScale, scale));
  if (scale <= 1.01) return fitted;
  const originX = bounds.left + bounds.width / 2;
  const originY = bounds.top + bounds.height / 2;
  const ratio = scale / view.scale;
  return bounded({
    scale,
    x: end.x - originX - (start.x - originX - view.x) * ratio,
    y: end.y - originY - (start.y - originY - view.y) * ratio
  }, bounds, image);
}

export function useReviewPhotoGestures({ active, previous, next }: {
  active: boolean; previous?: () => void; next?: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const current = useRef(fitted);
  const navigation = useRef({ previous, next });
  const [view, setView] = useState(fitted);
  const [layout, setLayout] = useState<ReviewPhotoLayout | null>(null);
  navigation.current = { previous, next };

  function update(view: View) {
    current.current = view;
    setView(view);
  }

  function zoomBy(change: number) {
    const box = viewport.current?.getBoundingClientRect();
    const image = frame.current?.getBoundingClientRect();
    if (!box || !image) return;
    const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    update(zoomAt(current.current, current.current.scale + change, center, center, box, image));
  }

  useEffect(() => {
    const element = viewport.current;
    const image = frame.current;
    if (!element || !image || !active) return;
    let gesture: TouchGesture | null = null;
    let mouse: { id: number; start: Point; view: View } | null = null;
    let lastTap: { point: Point; time: number } | null = null;

    function pan(view: View, dx: number, dy: number) {
      if (!element || !image) return;
      update(bounded({ scale: view.scale, x: view.x + dx, y: view.y + dy },
        element.getBoundingClientRect(), image.getBoundingClientRect()));
    }

    function wheel(event: WheelEvent) {
      if (!element || !image || !event.deltaY || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const delta = Math.max(-120, Math.min(120, event.deltaY * unit));
      const cursor = { x: event.clientX, y: event.clientY };
      update(zoomAt(current.current, current.current.scale * Math.exp(-delta / 500),
        cursor, cursor, element.getBoundingClientRect(), image.getBoundingClientRect()));
    }

    function start(event: TouchEvent) {
      if (event.touches.length >= 2) {
        lastTap = null;
        gesture = { kind: "pinch", ...pinch(event.touches), view: current.current };
        return;
      }
      if (event.target instanceof Element && event.target.closest("button")) {
        lastTap = null;
        return;
      }
      const start = point(event.touches[0]);
      gesture = current.current.scale > 1
        ? { kind: "pan", start, view: current.current, time: event.timeStamp, moved: false }
        : { kind: "single", start, time: event.timeStamp, moved: false };
    }

    function move(event: TouchEvent) {
      if (!element || !image || !gesture) return;
      const touch = point(event.touches[0]);
      if (gesture.kind === "pinch" && event.touches.length >= 2) {
        event.preventDefault();
        const { center, distance } = pinch(event.touches);
        update(zoomAt(gesture.view, gesture.view.scale * distance / gesture.distance,
          gesture.center, center, element.getBoundingClientRect(), image.getBoundingClientRect()));
      } else if (gesture.kind === "pan") {
        event.preventDefault();
        const dx = touch.x - gesture.start.x;
        const dy = touch.y - gesture.start.y;
        if (Math.hypot(dx, dy) > 10) gesture.moved = true;
        pan(gesture.view, dx, dy);
      } else if (gesture.kind === "single") {
        const dx = Math.abs(touch.x - gesture.start.x);
        const dy = Math.abs(touch.y - gesture.start.y);
        if (Math.max(dx, dy) > 10) gesture.moved = true;
        if (dx > 10 && dx > dy) event.preventDefault();
      }
    }

    function end(event: TouchEvent) {
      if (!element || !image || !gesture) return;
      const previousGesture = gesture;
      gesture = null;
      if (event.touches.length >= 2) {
        gesture = { kind: "pinch", ...pinch(event.touches), view: current.current };
        return;
      }
      if (event.touches.length === 1) {
        if (current.current.scale > 1) {
          gesture = { kind: "pan", start: point(event.touches[0]), view: current.current, time: null, moved: false };
        }
        return;
      }

      const end = point(event.changedTouches[0]);
      if (previousGesture.kind === "pinch") return;
      const dx = end.x - previousGesture.start.x;
      const dy = end.y - previousGesture.start.y;
      if (previousGesture.kind === "single" && Math.abs(dx) >= 42 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        lastTap = null;
        if (dx < 0) navigation.current.next?.();
        else navigation.current.previous?.();
        return;
      }
      if (previousGesture.time === null || previousGesture.moved || Math.hypot(dx, dy) > 10 ||
          event.timeStamp - previousGesture.time > 300) {
        lastTap = null;
        return;
      }

      if (lastTap && event.timeStamp - lastTap.time < 300 && Math.hypot(end.x - lastTap.point.x, end.y - lastTap.point.y) < 32) {
        const scale = current.current.scale > 1 ? 1 : 2.5;
        update(zoomAt(current.current, scale, end, end, element.getBoundingClientRect(), image.getBoundingClientRect()));
        lastTap = null;
      } else {
        lastTap = { point: end, time: event.timeStamp };
      }
    }

    function cancel() {
      gesture = null;
      lastTap = null;
    }

    function mouseDown(event: PointerEvent) {
      if (!element || event.pointerType !== "mouse" || event.button !== 0 || current.current.scale <= 1 ||
          (event.target instanceof Element && event.target.closest("button"))) return;
      event.preventDefault();
      mouse = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, view: current.current };
      element.setPointerCapture(event.pointerId);
    }

    function mouseMove(event: PointerEvent) {
      if (mouse?.id === event.pointerId) pan(mouse.view, event.clientX - mouse.start.x, event.clientY - mouse.start.y);
    }

    function mouseEnd(event: PointerEvent) {
      if (mouse?.id === event.pointerId) mouse = null;
    }

    const resize = new ResizeObserver(() => {
      const bounds = element.getBoundingClientRect();
      const photo = image.getBoundingClientRect();
      setLayout({ viewport: bounds, image: photo });
      if (current.current.scale > 1) update(bounded(current.current, bounds, photo));
    });
    resize.observe(element);
    resize.observe(image);
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("touchstart", start, { passive: true });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end, { passive: true });
    element.addEventListener("touchcancel", cancel);
    element.addEventListener("pointerdown", mouseDown);
    element.addEventListener("pointermove", mouseMove);
    element.addEventListener("lostpointercapture", mouseEnd);
    return () => {
      resize.disconnect();
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("touchstart", start);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", cancel);
      element.removeEventListener("pointerdown", mouseDown);
      element.removeEventListener("pointermove", mouseMove);
      element.removeEventListener("lostpointercapture", mouseEnd);
    };
  }, [active]);

  return { viewport, frame, view, layout, zoomBy, reset: () => update(fitted), maxScale };
}
