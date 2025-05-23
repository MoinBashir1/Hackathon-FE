import React, { useState, useEffect, useRef } from 'react';

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
  const audioContext = useRef(null);
  const mediaStream = useRef(null);
  const sourceNode = useRef(null);
  const processorNode = useRef(null);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  // Cleanup function to close audio context and stop media stream safely
  const cleanup = () => {
    if (processorNode.current) {
      processorNode.current.disconnect();
      processorNode.current.onaudioprocess = null;
      processorNode.current = null;
    }

    if (sourceNode.current) {
      sourceNode.current.disconnect();
      sourceNode.current = null;
    }

    if (audioContext.current) {
      audioContext.current.close().catch(() => {
        // ignore errors if already closed
      });
      audioContext.current = null;
    }

    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach(track => track.stop());
      mediaStream.current = null;
    }

    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
  };

  // Downsample function from current sample rate to 16kHz
  const downsampleBuffer = (buffer, sampleRate, outSampleRate) => {
    if (outSampleRate === sampleRate) {
      return buffer;
    }
    if (outSampleRate > sampleRate) {
      throw 'downsampling rate should be smaller than original sample rate';
    }
    const sampleRateRatio = sampleRate / outSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Int16Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0, count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = Math.min(1, accum / count) * 0x7FFF; // convert to 16-bit PCM
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result.buffer;
  };

  const connectToServer = () => {
    if (!phoneNumber) return;
    
    ws.current = new WebSocket('ws://localhost:8080');
    ws.current.binaryType = 'arraybuffer';
    
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
      // Check if it's binary data (translated audio)
      if (event.data instanceof ArrayBuffer) {
        playAudio(event.data);
        return;
      }

      // Handle JSON messages
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'incomingCall':
            setIncomingCall({
              from: data.from
            });
            setRemoteLanguage(data.fromLanguage);
            setCallStatus('incoming');
            break;
            
          case 'callAnswered':
            setRemoteLanguage(data.responderLanguage);
            setCallStatus('connected');
            startAudioCapture();
            break;
            
          case 'callEnded':
            endCall();
            break;
            
          case 'callFailed':
            alert(data.message);
            setCallStatus('disconnected');
            break;
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };
    
    ws.current.onclose = () => {
      console.log('Disconnected from signaling server');
      setIsConnected(false);
      cleanup();
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  };

  const startAudioCapture = async () => {
    try {
      // Request microphone access
      mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();

      if (audioContext.current.sampleRate !== 16000) {
        console.warn(`AudioContext sample rate is ${audioContext.current.sampleRate}Hz, audio will be downsampled to 16000Hz before sending.`);
      }

      sourceNode.current = audioContext.current.createMediaStreamSource(mediaStream.current);

      // Create ScriptProcessorNode for audio processing
      processorNode.current = audioContext.current.createScriptProcessor(4096, 1, 1);

      sourceNode.current.connect(processorNode.current);
      processorNode.current.connect(audioContext.current.destination);

      processorNode.current.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer.getChannelData(0);
        const downsampledBuffer = downsampleBuffer(inputBuffer, audioContext.current.sampleRate, 16000);

        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(downsampledBuffer);
        }
      };
    } catch (error) {
      console.error('Error starting audio capture:', error);
      alert('Microphone access denied or error: ' + error.message);
    }
  };

  // Play received audio from backend using AudioContext
  const playAudio = (arrayBuffer) => {
    if (!audioContext.current) {
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    audioContext.current.decodeAudioData(arrayBuffer).then((buffer) => {
      const playbackSource = audioContext.current.createBufferSource();
      playbackSource.buffer = buffer;
      playbackSource.connect(audioContext.current.destination);
      playbackSource.start();
    }).catch(e => {
      console.error('Error decoding audio data:', e);
    });
  };

  const startCall = () => {
    if (!remotePhoneNumber || !ws.current) return;
    
    setCallStatus('calling');
    
    ws.current.send(JSON.stringify({
      type: 'call',
      from: phoneNumber,
      to: remotePhoneNumber,
      language: language
    }));
  };
  
  const answerCall = () => {
    if (!incomingCall || !ws.current) return;
    
    setCallStatus('connecting');
    
    ws.current.send(JSON.stringify({
      type: 'answer',
      to: incomingCall.from,
      language: language
    }));
    
    setCallStatus('connected');
    setIncomingCall(null);
    startAudioCapture();
  };
  
  const endCall = () => {
    if (ws.current && remotePhoneNumber) {
      ws.current.send(JSON.stringify({
        type: 'endCall',
        to: remotePhoneNumber
      }));
    }
    
    cleanup();
    setCallStatus('disconnected');
    setIncomingCall(null);
  };
  
  const rejectCall = () => {
    setIncomingCall(null);
    setCallStatus('disconnected');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#333', textAlign: 'center' }}>Web Call Service with Translation</h1>
      
      {!isConnected ? (
        <div style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ marginBottom: '15px' }}>
            <input
              type="text"
              placeholder="Enter your phone number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              style={{
                padding: '10px',
                width: '100%',
                marginBottom: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '16px'
              }}
            />
          </div>
          <div style={{ marginBottom: '15px' }}>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={{
                padding: '10px',
                width: '100%',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '16px'
              }}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
          <button 
            onClick={connectToServer}
            style={{
              padding: '12px 24px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              cursor: 'pointer'
            }}
          >
            Connect
          </button>
        </div>
      ) : (
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#f8f9fa', 
            borderRadius: '4px', 
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '5px' }}>
              Status: <span style={{ color: callStatus === 'connected' ? '#28a745' : '#007bff' }}>
                {callStatus}
              </span>
            </div>
            <div>Your number: {phoneNumber} ({LANGUAGES.find(l => l.code === language)?.name})</div>
          </div>
          
          {callStatus === 'disconnected' && (
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <input
                type="text"
                placeholder="Enter phone number to call"
                value={remotePhoneNumber}
                onChange={(e) => setRemotePhoneNumber(e.target.value)}
                style={{
                  padding: '10px',
                  width: '70%',
                  marginRight: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '16px'
                }}
              />
              <button 
                onClick={startCall}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
              >
                📞 Call
              </button>
            </div>
          )}
          
          {callStatus === 'incoming' && incomingCall && (
            <div style={{ 
              padding: '20px', 
              backgroundColor: '#fff3cd', 
              borderRadius: '4px', 
              textAlign: 'center',
              marginBottom: '20px'
            }}>
              <p style={{ fontSize: '18px', marginBottom: '15px' }}>
                Incoming call from: <strong>{incomingCall.from}</strong><br/>
                Language: {LANGUAGES.find(l => l.code === remoteLanguage)?.name}
              </p>
              <button 
                onClick={answerCall}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '16px',
                  cursor: 'pointer',
                  marginRight: '10px'
                }}
              >
                📞 Answer
              </button>
              <button 
                onClick={rejectCall}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
              >
                📵 Reject
              </button>
            </div>
          )}
          
          {(callStatus === 'calling' || callStatus === 'connecting' || callStatus === 'connected') && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ 
                padding: '15px', 
                backgroundColor: '#d4edda', 
                borderRadius: '4px', 
                marginBottom: '15px' 
              }}>
                <strong>Translation Active:</strong><br/>
                {LANGUAGES.find(l => l.code === language)?.name} ↔ {LANGUAGES.find(l => l.code === remoteLanguage)?.name}
              </div>
              
              {callStatus === 'connected' && (
                <div style={{ 
                  padding: '10px', 
                  backgroundColor: '#d1ecf1', 
                  borderRadius: '4px', 
                  marginBottom: '15px',
                  fontSize: '14px'
                }}>
                  🎤 Speak now - your voice is being translated in real-time
                </div>
              )}
              
              <button 
                onClick={endCall}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
              >
                📵 End Call
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;