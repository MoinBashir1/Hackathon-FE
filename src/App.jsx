import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// Supported languages
const LANGUAGES = [
  { code: 'en-US', name: 'English' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'ta-IN', name: 'Tamil' },
  { code: 'kn-IN', name: 'Kannada' }
];

function App() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [isConnected, setIsConnected] = useState(false);
  const [callStatus, setCallStatus] = useState('disconnected');
  const [remotePhoneNumber, setRemotePhoneNumber] = useState('');
  const [incomingCall, setIncomingCall] = useState(null);
  const [remoteLanguage, setRemoteLanguage] = useState('en-US');
  
  const ws = useRef(null);
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pc = useRef(null);
  const localStream = useRef(null);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const audioContext = useRef(null);
  const audioBufferSource = useRef(null);

  useEffect(() => {
    return () => {
      if (ws.current) {
        ws.current.close();
      }
      if (pc.current) {
        pc.current.close();
      }
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
      }
      if (mediaRecorder.current) {
        mediaRecorder.current.stop();
      }
      if (audioContext.current) {
        audioContext.current.close();
      }
    };
  }, []);

  const connectToServer = () => {
    if (!phoneNumber) return;
    
    ws.current = new WebSocket('ws://localhost:8080');
    
    ws.current.onopen = () => {
      console.log('Connected to signaling server');
      ws.current.send(JSON.stringify({
        type: 'register',
        phoneNumber: phoneNumber,
        language: language
      }));
      setIsConnected(true);
    };
    
    ws.current.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'incomingCall':
          setIncomingCall({
            from: data.from,
            offer: data.offer
          });
          setRemoteLanguage(data.fromLanguage);
          setCallStatus('incoming');
          break;
          
        case 'callAnswered':
          await pc.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          setRemoteLanguage(data.responderLanguage);
          setCallStatus('connected');
          startAudioProcessing();
          break;
          
        case 'iceCandidate':
          try {
            await pc.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {
            console.error('Error adding ICE candidate', e);
          }
          break;
          
        case 'callEnded':
          endCall();
          break;
          
        case 'callFailed':
          alert(data.message);
          setCallStatus('disconnected');
          break;
          
        case 'translatedAudio':
          playTranslatedAudio(data.audioData);
          break;
      }
    };
    
    ws.current.onclose = () => {
      console.log('Disconnected from signaling server');
    };
  };

  const startAudioProcessing = async () => {
    try {
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
      
      // Setup media recorder to capture audio chunks
      mediaRecorder.current = new MediaRecorder(localStream.current);
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          event.data.arrayBuffer().then(buffer => {
            ws.current.send(JSON.stringify({
              type: 'audioChunk',
              chunk: new Uint8Array(buffer)
            }));
          });
        }
      };
      mediaRecorder.current.start(100); // Collect 100ms chunks
    } catch (error) {
      console.error('Error setting up audio processing:', error);
    }
  };

  const playTranslatedAudio = (audioData) => {
    if (!audioContext.current) return;
    
    audioContext.current.decodeAudioData(audioData.buffer).then(buffer => {
      if (audioBufferSource.current) {
        audioBufferSource.current.stop();
      }
      
      audioBufferSource.current = audioContext.current.createBufferSource();
      audioBufferSource.current.buffer = buffer;
      audioBufferSource.current.connect(audioContext.current.destination);
      audioBufferSource.current.start(0);
    });
  };

  const startCall = async () => {
    if (!remotePhoneNumber || !ws.current) return;
    
    try {
      setCallStatus('calling');
      
      // Get local audio stream
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      localAudioRef.current.srcObject = localStream.current;
      
      // Create peer connection
      pc.current = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
        ]
      });
      
      // Add local stream to connection
      localStream.current.getTracks().forEach(track => {
        pc.current.addTrack(track, localStream.current);
      });
      
      // Set up ICE candidate handler
      pc.current.onicecandidate = (event) => {
        if (event.candidate) {
          ws.current.send(JSON.stringify({
            type: 'iceCandidate',
            to: remotePhoneNumber,
            candidate: event.candidate
          }));
        }
      };
      
      // Set up remote stream handler
      pc.current.ontrack = (event) => {
        remoteAudioRef.current.srcObject = event.streams[0];
      };
      
      // Create offer
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      
      // Send offer to the other peer
      ws.current.send(JSON.stringify({
        type: 'call',
        from: phoneNumber,
        to: remotePhoneNumber,
        offer: offer,
        language: language
      }));
      
    } catch (error) {
      console.error('Error starting call:', error);
      endCall();
    }
  };
  
  const answerCall = async () => {
    if (!incomingCall || !ws.current) return;
    
    try {
      setCallStatus('connecting');
      
      // Get local audio stream
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      localAudioRef.current.srcObject = localStream.current;
      
      // Create peer connection
      pc.current = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
        ]
      });
      
      // Add local stream to connection
      localStream.current.getTracks().forEach(track => {
        pc.current.addTrack(track, localStream.current);
      });
      
      // Set up ICE candidate handler
      pc.current.onicecandidate = (event) => {
        if (event.candidate) {
          ws.current.send(JSON.stringify({
            type: 'iceCandidate',
            to: incomingCall.from,
            candidate: event.candidate
          }));
        }
      };
      
      // Set up remote stream handler
      pc.current.ontrack = (event) => {
        remoteAudioRef.current.srcObject = event.streams[0];
      };
      
      // Set remote description
      await pc.current.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      
      // Create answer
      const answer = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answer);
      
      // Send answer to the other peer
      ws.current.send(JSON.stringify({
        type: 'answer',
        to: incomingCall.from,
        answer: answer,
        language: language
      }));
      
      setCallStatus('connected');
      setIncomingCall(null);
      startAudioProcessing();
      
    } catch (error) {
      console.error('Error answering call:', error);
      endCall();
    }
  };
  
  const endCall = () => {
    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }
    
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }
    
    if (mediaRecorder.current) {
      mediaRecorder.current.stop();
      mediaRecorder.current = null;
    }
    
    if (ws.current && remotePhoneNumber) {
      ws.current.send(JSON.stringify({
        type: 'endCall',
        to: remotePhoneNumber
      }));
    }
    
    setCallStatus('disconnected');
    setIncomingCall(null);
    localAudioRef.current.srcObject = null;
    remoteAudioRef.current.srcObject = null;
  };
  
  const rejectCall = () => {
    setIncomingCall(null);
    setCallStatus('disconnected');
  };

  return (
    <div className="app">
      <h1>Web Call Service with Translation</h1>
      
      {!isConnected ? (
        <div className="connect-form">
          <input
            type="text"
            placeholder="Enter your phone number"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
          />
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
          <button onClick={connectToServer}>Connect</button>
        </div>
      ) : (
        <div className="call-container">
          <div className="status">Status: {callStatus}</div>
          <div className="my-number">Your number: {phoneNumber} ({LANGUAGES.find(l => l.code === language)?.name})</div>
          
          {callStatus === 'disconnected' && (
            <div className="call-form">
              <input
                type="text"
                placeholder="Enter phone number to call"
                value={remotePhoneNumber}
                onChange={(e) => setRemotePhoneNumber(e.target.value)}
              />
              <button onClick={startCall} className="call-button">
                <i className="fas fa-phone"></i> Call
              </button>
            </div>
          )}
          
          {callStatus === 'incoming' && incomingCall && (
            <div className="incoming-call">
              <p>Incoming call from: {incomingCall.from} ({LANGUAGES.find(l => l.code === remoteLanguage)?.name})</p>
              <button onClick={answerCall} className="answer-button">
                <i className="fas fa-phone"></i> Answer
              </button>
              <button onClick={rejectCall} className="reject-button">
                <i className="fas fa-phone-slash"></i> Reject
              </button>
            </div>
          )}
          
          {(callStatus === 'calling' || callStatus === 'connecting' || callStatus === 'connected') && (
            <div className="call-controls">
              <div className="language-info">
                Translating from {LANGUAGES.find(l => l.code === language)?.name} to {LANGUAGES.find(l => l.code === remoteLanguage)?.name}
              </div>
              <button onClick={endCall} className="end-call-button">
                <i className="fas fa-phone-slash"></i> End Call
              </button>
            </div>
          )}
          
          <div className="audio-containers">
            <audio ref={localAudioRef} autoPlay muted />
            <audio ref={remoteAudioRef} autoPlay />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;