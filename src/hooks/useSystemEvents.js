import { useEffect, useRef, useState } from 'react';

/**
 * IMS Unified Server-Sent Events (SSE) Client Hook
 * Addresses Dev Idea #42 (Phase 3 of System Architecture Plan)
 *
 * Establishes a shared singleton SSE connection to /api/events with 20-second
 * keep-alive ping tolerance, automatic exponential backoff reconnection,
 * and zero polling overhead.
 *
 * Usage:
 *   useSystemEvents('glucose:update', (reading) => setGlucose(reading));
 *   useSystemEvents('doorbell:ding', (alert) => triggerAlertBanner(alert));
 *   useSystemEvents('job:complete', (job) => refreshJobsList());
 *   useSystemEvents('log:entry', (entry) => appendLiveLog(entry));
 */

let sharedEventSource = null;
const subscribers = new Map(); // topic -> Set of callbacks
const connectionStatusListeners = new Set();
let status = 'disconnected'; // 'connecting' | 'connected' | 'error' | 'disconnected'
let reconnectTimer = null;
let reconnectAttempts = 0;

function notifyStatus(newStatus) {
  status = newStatus;
  connectionStatusListeners.forEach((listener) => {
    try {
      listener(status);
    } catch (_) {}
  });
}

// Topics already bound on each EventSource: a listener can't be removed from the connection when a
// topic's last subscriber goes, so without this every re-subscribe added another one and each event
// was dispatched several times (e.g. the doorbell announcement spoken over itself).
const boundTopics = new WeakMap();

function bindTopicListener(es, topic) {
  if (!boundTopics.has(es)) boundTopics.set(es, new Set());
  const bound = boundTopics.get(es);
  if (bound.has(topic)) return;
  bound.add(topic);
  es.addEventListener(topic, (e) => {
    try {
      const data = JSON.parse(e.data);
      dispatch(topic, data);
    } catch (_) {
      dispatch(topic, e.data);
    }
  });
}

function initSharedConnection() {
  if (
    sharedEventSource &&
    (sharedEventSource.readyState === EventSource.CONNECTING ||
      sharedEventSource.readyState === EventSource.OPEN)
  ) {
    return;
  }

  notifyStatus('connecting');
  const es = new EventSource('/api/events');
  sharedEventSource = es;

  es.onopen = () => {
    reconnectAttempts = 0;
    notifyStatus('connected');
  };

  es.onerror = () => {
    notifyStatus('error');
    es.close();
    sharedEventSource = null;

    // Exponential backoff reconnection capped at 30 seconds
    const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts++), 30000);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (subscribers.size > 0 || connectionStatusListeners.size > 0) {
        initSharedConnection();
      }
    }, delay);
  };

  // Register all active topics on the EventSource instance
  for (const topic of subscribers.keys()) {
    bindTopicListener(es, topic);
  }
}

function dispatch(topic, payload) {
  const cbs = subscribers.get(topic);
  if (cbs) {
    cbs.forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[useSystemEvents] Error in callback for "${topic}":`, err);
      }
    });
  }
}

/**
 * Subscribes a callback to an SSE topic via the shared EventSource singleton
 */
export function subscribeToTopic(topic, callback) {
  if (!subscribers.has(topic)) {
    subscribers.set(topic, new Set());
    if (sharedEventSource && sharedEventSource.readyState === EventSource.OPEN) {
      bindTopicListener(sharedEventSource, topic);
    }
  }
  subscribers.get(topic).add(callback);
  initSharedConnection();

  return () => {
    const cbs = subscribers.get(topic);
    if (cbs) {
      cbs.delete(callback);
      if (cbs.size === 0) {
        subscribers.delete(topic);
      }
    }
  };
}

/**
 * React hook subscribing to a real-time system event topic
 * @param {string} topic Event name (e.g. 'glucose:update', 'doorbell:ding', 'job:complete')
 * @param {Function} handler Callback receiving the event payload
 * @param {Array} deps Additional hook dependency array
 */
export function useSystemEvents(topic, handler, deps = []) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const [eventStatus, setEventStatus] = useState(status);

  useEffect(() => {
    const statusUnsub = (s) => setEventStatus(s);
    connectionStatusListeners.add(statusUnsub);

    let topicUnsub = null;
    if (topic) {
      topicUnsub = subscribeToTopic(topic, (data) => {
        if (handlerRef.current) {
          handlerRef.current(data);
        }
      });
    }

    return () => {
      connectionStatusListeners.delete(statusUnsub);
      if (topicUnsub) topicUnsub();
    };
  }, [topic, ...deps]);

  return { status: eventStatus };
}

export default useSystemEvents;
