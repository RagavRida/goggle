/**
 * WebSocket Hook
 * 
 * React hook for real-time connection to ContextOS kernel events.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export interface ContextOSEvent {
    type: string;
    timestamp: number;
    payload: unknown;
    source: string;
}

interface UseWebSocketResult {
    connected: boolean;
    events: ContextOSEvent[];
    latestEvent: ContextOSEvent | null;
    sendMessage: (message: object) => void;
    clearEvents: () => void;
}

export function useWebSocket(url: string = 'ws://localhost:3001/ws'): UseWebSocketResult {
    const [connected, setConnected] = useState(false);
    const [events, setEvents] = useState<ContextOSEvent[]>([]);
    const [latestEvent, setLatestEvent] = useState<ContextOSEvent | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        try {
            const ws = new WebSocket(url);

            ws.onopen = () => {
                console.log('[WebSocket] Connected');
                setConnected(true);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data) as ContextOSEvent;
                    setLatestEvent(data);
                    setEvents((prev) => [...prev.slice(-99), data]); // Keep last 100 events
                } catch (error) {
                    console.error('[WebSocket] Failed to parse message:', error);
                }
            };

            ws.onclose = () => {
                console.log('[WebSocket] Disconnected');
                setConnected(false);
                wsRef.current = null;

                // Attempt to reconnect after 3 seconds
                reconnectTimeoutRef.current = setTimeout(() => {
                    connect();
                }, 3000);
            };

            ws.onerror = (error) => {
                console.error('[WebSocket] Error:', error);
            };

            wsRef.current = ws;
        } catch (error) {
            console.error('[WebSocket] Failed to connect:', error);
            // Retry connection
            reconnectTimeoutRef.current = setTimeout(() => {
                connect();
            }, 3000);
        }
    }, [url]);

    const sendMessage = useCallback((message: object) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(message));
        } else {
            console.warn('[WebSocket] Cannot send message - not connected');
        }
    }, []);

    const clearEvents = useCallback(() => {
        setEvents([]);
        setLatestEvent(null);
    }, []);

    useEffect(() => {
        connect();

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [connect]);

    return {
        connected,
        events,
        latestEvent,
        sendMessage,
        clearEvents,
    };
}

export default useWebSocket;
