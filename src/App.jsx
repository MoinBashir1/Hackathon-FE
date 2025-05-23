import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// Supported languages
const LANGUAGES = [
  { code: 'en-US', name: 'English', voice: 'en-US-JennyNeural' },
  { code: 'hi-IN', name: 'Hindi', voice: 'hi-IN-MadhurNeural' },
  { code: 'ta-IN', name: 'Tamil', voice: 'ta-IN-PallaviNeural' },
  { code: 'kn-IN', name: 'Kannada', voice: 'kn-IN-GaganNeural' }
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
  const audioContext = useRef(null);
  const processorNode = useRef(null);
  const audioBufferSource = useRef(null);

  // Initialize audio context
  const initAudioContext = () => {
    if (!audioContext.current) {
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
    }
  };

  // Cleanup resources
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
      if (processorNode.current) {
        processorNode.current.disconnect();
      }
      if (audioContext.current) {
        audioContext.current.close();
      }
    };
  }, []);

  // Connect to WebSocket server
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
      console.log('Received message:', data);
      
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
          try {
            await pc.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            setRemoteLanguage(data.responderLanguage);
            setCallStatus('connected');
            startAudioProcessing();
          } catch (error) {
            console.error('Error setting remote description:', error);
            endCall();
          }
          break;
          
        case 'iceCandidate':
          try {
            if (data.candidate) {
              await pc.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
          } catch (e) {
            console.error('Error adding ICE candidate', e);
          }
          break;
          
        case 'callEnded':
          endCall();
          alert('Call ended by the other party');
          break;
          
        case 'callFailed':
          alert(data.message);
          setCallStatus('disconnected');
          break;
          
        case 'translatedAudio':
          playTranslatedAudio(data.audioData);
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    };
    
    ws.current.onclose = () => {
      console.log('Disconnected from signaling server');
      setIsConnected(false);
      setCallStatus('disconnected');
    };
    
    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  };

  // Process audio chunks and send to server
  const processAudioChunk = (audioBuffer) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN || callStatus !== 'connected') return;
    
    try {
      // Convert audio buffer to WAV format
      const wavBuffer = encodeWAV(audioBuffer);
      ws.current.send(JSON.stringify({
        type: 'audioChunk',
        chunk: new Uint8Array(wavBuffer)
      }));
    } catch (error) {
      console.error('Error processing audio chunk:', error);
    }
  };

  // Start audio processing
  const startAudioProcessing = async () => {
    try {
      initAudioContext();
      
      // Create a MediaStreamAudioSourceNode from the microphone stream
      const sourceNode = audioContext.current.createMediaStreamSource(localStream.current);
      
      // Create a script processor node to process audio chunks
      processorNode.current = audioContext.current.createScriptProcessor(4096, 1, 1);
      processorNode.current.onaudioprocess = (e) => {
        if (callStatus === 'connected') {
          const inputBuffer = e.inputBuffer;
          const leftChannel = inputBuffer.getChannelData(0);
          
          // Create a new audio buffer
          const newBuffer = audioContext.current.createBuffer(1, leftChannel.length, audioContext.current.sampleRate);
          newBuffer.getChannelData(0).set(leftChannel);
          
          // Process the audio chunk
          processAudioChunk(newBuffer);
        }
      };
      
      sourceNode.connect(processorNode.current);
      processorNode.current.connect(audioContext.current.destination);
      
    } catch (error) {
      console.error('Error setting up audio processing:', error);
    }
  };

  // Play translated audio received from server
  const playTranslatedAudio = (audioData) => {
    initAudioContext();
    
    if (audioBufferSource.current) {
      audioBufferSource.current.stop();
    }
    
    audioContext.current.decodeAudioData(audioData.buffer.slice(0))
      .then(buffer => {
        audioBufferSource.current = audioContext.current.createBufferSource();
        audioBufferSource.current.buffer = buffer;
        audioBufferSource.current.connect(audioContext.current.destination);
        audioBufferSource.current.start(0);
      })
      .catch(error => {
        console.error('Error decoding translated audio:', error);
      });
  };

  // Start a call
  const startCall = async () => {
    if (!remotePhoneNumber || !ws.current) return;
    
    try {
      setCallStatus('calling');
      
      // Get local audio stream
      localStream.current = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      localAudioRef.current.srcObject = localStream.current;
      
      // Create peer connection
      pc.current = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          // Add TURN servers here for production
        ]
      });
      
      // Add local stream to connection
      localStream.current.getTracks().forEach(track => {
        pc.current.addTrack(track, localStream.current);
      });
      
      // ICE candidate handler
      pc.current.onicecandidate = (event) => {
        if (event.candidate) {
          ws.current.send(JSON.stringify({
            type: 'iceCandidate',
            to: remotePhoneNumber,
            candidate: event.candidate
          }));
        }
      };
      
      // Remote stream handler
      pc.current.ontrack = (event) => {
        remoteAudioRef.current.srcObject = event.streams[0];
      };
      
      // Create offer
      const offer = await pc.current.createOffer({
        offerToReceiveAudio: true
      });
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
      alert('Failed to start call. Please check your microphone permissions.');
    }
  };
  
  // Answer an incoming call
  const answerCall = async () => {
    if (!incomingCall || !ws.current) return;
    
    try {
      setCallStatus('connecting');
      
      // Get local audio stream
      localStream.current = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
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
      
      // ICE candidate handler
      pc.current.onicecandidate = (event) => {
        if (event.candidate) {
          ws.current.send(JSON.stringify({
            type: 'iceCandidate',
            to: incomingCall.from,
            candidate: event.candidate
          }));
        }
      };
      
      // Remote stream handler
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
      alert('Failed to answer call. Please check your microphone permissions.');
    }
  };
  
  // End the current call
  const endCall = () => {
    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }
    
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }
    
    if (processorNode.current) {
      processorNode.current.disconnect();
      processorNode.current = null;
    }
    
    if (ws.current && (remotePhoneNumber || (incomingCall && incomingCall.from))) {
      ws.current.send(JSON.stringify({
        type: 'endCall',
        to: remotePhoneNumber || incomingCall.from
      }));
    }
    
    setCallStatus('disconnected');
    setIncomingCall(null);
    setRemotePhoneNumber('');
    
    if (localAudioRef.current) {
      localAudioRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  };
  
  // Reject an incoming call
  const rejectCall = () => {
    if (incomingCall && ws.current) {
      ws.current.send(JSON.stringify({
        type: 'endCall',
        to: incomingCall.from
      }));
    }
    setIncomingCall(null);
    setCallStatus('disconnected');
  };

  // Helper function to encode audio as WAV
  const encodeWAV = (buffer) => {
    const numChannels = 1;
    const sampleRate = audioContext.current.sampleRate;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const bufferLength = buffer.length * numChannels * bytesPerSample;
    
    const arrayBuffer = new ArrayBuffer(44 + bufferLength);
    const view = new DataView(arrayBuffer);
    
    // Write WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + bufferLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(view, 36, 'data');
    view.setUint32(40, bufferLength, true);
    
    // Write audio samples
    const offset = 44;
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < channelData.length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    }
    
    return arrayBuffer;
  };

  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  return (
    <div className="app">
      <h1>Voice Call Translator</h1>
      
      {!isConnected ? (
        <div className="connect-form">
          <h2>Connect to Call Service</h2>
          <div className="form-group">
            <label htmlFor="phoneNumber">Your Phone Number:</label>
            <input
              id="phoneNumber"
              type="text"
              placeholder="Enter your phone number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="language">Your Language:</label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
          <button onClick={connectToServer} className="connect-button">
            Connect
          </button>
        </div>
      ) : (
        <div className="call-container">
          <div className={`status ${callStatus}`}>
            Status: {callStatus.charAt(0).toUpperCase() + callStatus.slice(1)}
          </div>
          <div className="user-info">
            <div>Your number: {phoneNumber}</div>
            <div>Your language: {LANGUAGES.find(l => l.code === language)?.name}</div>
          </div>
          
          {callStatus === 'disconnected' && (
            <div className="call-form">
              <h3>Make a Call</h3>
              <div className="form-group">
                <label htmlFor="remoteNumber">Phone Number to Call:</label>
                <input
                  id="remoteNumber"
                  type="text"
                  placeholder="Enter phone number to call"
                  value={remotePhoneNumber}
                  onChange={(e) => setRemotePhoneNumber(e.target.value)}
                />
              </div>
              <button onClick={startCall} className="call-button">
                <i className="fas fa-phone"></i> Call
              </button>
            </div>
          )}
          
          {callStatus === 'incoming' && incomingCall && (
            <div className="incoming-call">
              <h3>Incoming Call</h3>
              <p>From: {incomingCall.from}</p>
              <p>Language: {LANGUAGES.find(l => l.code === remoteLanguage)?.name}</p>
              <div className="call-actions">
                <button onClick={answerCall} className="answer-button">
                  <i className="fas fa-phone"></i> Answer
                </button>
                <button onClick={rejectCall} className="reject-button">
                  <i className="fas fa-phone-slash"></i> Reject
                </button>
              </div>
            </div>
          )}
          
          {(callStatus === 'calling' || callStatus === 'connecting' || callStatus === 'connected') && (
            <div className="active-call">
              <div className="call-info">
                {callStatus === 'calling' && <p>Calling {remotePhoneNumber}...</p>}
                {callStatus === 'connecting' && <p>Connecting...</p>}
                {callStatus === 'connected' && (
                  <>
                    <p>Connected with: {remotePhoneNumber || incomingCall?.from}</p>
                    <p>Translating from {LANGUAGES.find(l => l.code === language)?.name} to {LANGUAGES.find(l => l.code === remoteLanguage)?.name}</p>
                  </>
                )}
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