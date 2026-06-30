package com.aimscope.service;

import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket relay between browser clients and rosbridge.
 * Browser connects to ws://host:8080/ws/ros
 * Backend forwards to ws://localhost:9090 (rosbridge)
 * Messages are transparently relayed in both directions.
 */
public class RosRelayService extends TextWebSocketHandler {

    private static final String ROSBRIDGE_URL = "ws://localhost:9090";
    private final Map<String, WebSocketSession> clientSessions = new ConcurrentHashMap<>();
    private final Map<String, WebSocketSession> rosbridgeSessions = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String sessionId = session.getId();
        clientSessions.put(sessionId, session);

        // Connect to rosbridge
        var wsClient = new org.springframework.web.socket.client.standard.StandardWebSocketClient();
        wsClient.doHandshake(new RosbridgeHandler(sessionId, this), ROSBRIDGE_URL);

        // Send initial subscribe messages
        session.sendMessage(new TextMessage("{\"status\":\"connected\",\"relay\":true}"));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        WebSocketSession rosSession = rosbridgeSessions.get(session.getId());
        if (rosSession != null && rosSession.isOpen()) {
            rosSession.sendMessage(message);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String sessionId = session.getId();
        clientSessions.remove(sessionId);
        WebSocketSession rosSession = rosbridgeSessions.remove(sessionId);
        if (rosSession != null && rosSession.isOpen()) {
            rosSession.close();
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        clientSessions.remove(session.getId());
        WebSocketSession rosSession = rosbridgeSessions.remove(session.getId());
        if (rosSession != null && rosSession.isOpen()) {
            rosSession.close();
        }
    }

    // Called by the rosbridge handler when messages come from ROS
    void relayToClient(String clientSessionId, String message) throws IOException {
        WebSocketSession client = clientSessions.get(clientSessionId);
        if (client != null && client.isOpen()) {
            client.sendMessage(new TextMessage(message));
        }
    }

    // Called by the rosbridge handler on connect
    void registerRosbridgeSession(String clientSessionId, WebSocketSession rosSession) {
        rosbridgeSessions.put(clientSessionId, rosSession);
    }

    // Inner handler for the backend→rosbridge connection
    private static class RosbridgeHandler extends TextWebSocketHandler {
        private final String clientSessionId;
        private final RosRelayService relay;

        RosbridgeHandler(String clientSessionId, RosRelayService relay) {
            this.clientSessionId = clientSessionId;
            this.relay = relay;
        }

        @Override
        public void afterConnectionEstablished(WebSocketSession session) {
            relay.registerRosbridgeSession(clientSessionId, session);
        }

        @Override
        protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
            relay.relayToClient(clientSessionId, message.getPayload());
        }

        @Override
        public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
            relay.rosbridgeSessions.remove(clientSessionId);
        }
    }
}
