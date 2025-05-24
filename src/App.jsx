import React, { useState, useEffect, useRef } from 'react';

// Google Fonts import for Inter
const fontLink = document.createElement('link');
fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap';
fontLink.rel = 'stylesheet';
document.head.appendChild(fontLink);

// Supported languages
const LANGUAGES = [
  { code: 'en-US', name: 'English' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'ta-IN', name: 'Tamil' },
  { code: 'kn-IN', name: 'Kannada' }
];

// Common styles
const styles = {
  bg: {
    minHeight: '100vh',
    minWidth: '100vw',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(120deg, #e0e7ff 0%, #f8fafc 100%)',
    fontFamily: 'Inter, sans-serif',
  },
  card: {
    background: '#fff',
    borderRadius: '18px',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.10)',
    padding: '2.5rem 2rem',
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    alignItems: 'center',
  },
  logo: {
    width: '48px',
    height: '48px',
    marginBottom: '0.5rem',
    color: '#2563eb',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 700,
    color: '#22223b',
    marginBottom: '0.25rem',
    textAlign: 'center',
    letterSpacing: '-1px',
  },
  subtitle: {
    fontSize: '1rem',
    color: '#64748b',
    marginBottom: '0.5rem',
    textAlign: 'center',
  },
  input: {
    width: '100%',
    padding: '0.75rem 1rem',
    fontSize: '1rem',
    border: '1.5px solid #e5e7eb',
    borderRadius: '8px',
    background: '#f8fafc',
    color: '#22223b',
    outline: 'none',
    marginBottom: '0.5rem',
    transition: 'border 0.2s',
  },
  select: {
    width: '100%',
    padding: '0.75rem 1rem',
    fontSize: '1rem',
    border: '1.5px solid #e5e7eb',
    borderRadius: '8px',
    background: '#f8fafc',
    color: '#22223b',
    outline: 'none',
    marginBottom: '0.5rem',
    transition: 'border 0.2s',
  },
  button: {
    width: '100%',
    padding: '0.75rem 0',
    fontSize: '1.05rem',
    fontWeight: 600,
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 2px 8px 0 rgba(56,189,248,0.08)',
    transition: 'background 0.2s, transform 0.1s',
    marginTop: '0.5rem',
  },
  buttonDanger: {
    background: 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)',
  },
  buttonSuccess: {
    background: 'linear-gradient(90deg, #22c55e 0%, #4ade80 100%)',
  },
  status: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#2563eb',
    marginBottom: '0.5rem',
    textAlign: 'center',
  },
  info: {
    fontSize: '0.95rem',
    color: '#64748b',
    marginBottom: '0.5rem',
    textAlign: 'center',
  },
  translation: {
    background: '#f1f5f9',
    borderRadius: '8px',
    padding: '0.75rem',
    fontSize: '0.98rem',
    color: '#2563eb',
    marginBottom: '0.5rem',
    textAlign: 'center',
  },
  incoming: {
    background: '#fef9c3',
    border: '1px solid #fde68a',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '0.5rem',
    textAlign: 'center',
    color: '#b45309',
    fontWeight: 600,
  },
  callInputRow: {
    display: 'flex',
    width: '100%',
    gap: '0.5rem',
    marginBottom: '0.5rem',
  },
  callInput: {
    flex: 1,
    minWidth: 0,
  },
  callButton: {
    minWidth: '90px',
  },
  ringingAnimation: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  ringDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: '#2563eb',
    animation: 'ring 1.5s infinite',
  },
  '@keyframes ring': {
    '0%': { transform: 'scale(0.8)', opacity: 0.5 },
    '50%': { transform: 'scale(1.2)', opacity: 1 },
    '100%': { transform: 'scale(0.8)', opacity: 0.5 },
  },
  callTimer: {
    fontSize: '1.2rem',
    fontWeight: 600,
    color: '#22c55e',
    marginBottom: '1rem',
  },
};

function App() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [isConnected, setIsConnected] = useState(false);
  const [callStatus, setCallStatus] = useState('disconnected');
  const [remotePhoneNumber, setRemotePhoneNumber] = useState('');
  const [incomingCall, setIncomingCall] = useState(null);
  const [remoteLanguage, setRemoteLanguage] = useState('en-US');
  const [callDuration, setCallDuration] = useState(0);
  
  const ws = useRef(null);
  const audioContext = useRef(null);
  const mediaStream = useRef(null);
  const sourceNode = useRef(null);
  const processorNode = useRef(null);
  const timerRef = useRef(null);

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

    stopCallTimer();
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
            startCallTimer();
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
  
  const startCallTimer = () => {
    setCallDuration(0);
    timerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };

  const stopCallTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCallDuration(0);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
    startCallTimer();
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
    <div style={styles.bg}>
      <div style={styles.card}>
        {/* Logo/Icon */}
        <svg style={styles.logo} viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" fill="#e0e7ff" stroke="#2563eb" strokeWidth="2"/><path d="M16 32c0-4 8-4 8-8s-8-4-8-8" stroke="#2563eb" strokeWidth="2" strokeLinecap="round"/><circle cx="32" cy="24" r="4" fill="#2563eb"/></svg>
        <div style={styles.title}>Web Call Service <span style={{color:'#2563eb'}}>with Translation</span></div>
        <div style={styles.subtitle}>Call anyone, speak your language, get real-time translation.</div>
        {!isConnected ? (
          <>
            <input
              type="text"
              placeholder="Enter your phone number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              style={styles.input}
              autoFocus
            />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={styles.select}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
            <button onClick={connectToServer} style={styles.button}>Connect</button>
          </>
        ) : (
          <>
            <div style={styles.status}>Status: {callStatus.charAt(0).toUpperCase() + callStatus.slice(1)}</div>
            <div style={styles.info}>Your number: <b>{phoneNumber}</b> ({LANGUAGES.find(l => l.code === language)?.name})</div>
            {callStatus === 'disconnected' && (
              <>
                <input
                  type="text"
                  placeholder="Enter phone number to call"
                  value={remotePhoneNumber}
                  onChange={(e) => setRemotePhoneNumber(e.target.value)}
                  style={styles.input}
                />
                <button onClick={startCall} style={{...styles.button, ...styles.buttonSuccess, marginTop:'0.5rem'}}>📞 Call</button>
              </>
            )}
            {callStatus === 'incoming' && incomingCall && (
              <div style={styles.incoming}>
                <div style={styles.ringingAnimation}>
                  <div style={styles.ringDot}></div>
                  <div style={styles.ringDot}></div>
                  <div style={styles.ringDot}></div>
                </div>
                Incoming call from: <b>{incomingCall.from}</b><br/>
                Language: {LANGUAGES.find(l => l.code === remoteLanguage)?.name}<br/>
                <div style={{display:'flex',gap:'0.5rem',marginTop:'0.75rem',justifyContent:'center'}}>
                  <button onClick={answerCall} style={{...styles.button, ...styles.buttonSuccess, width:'auto'}}>📞 Answer</button>
                  <button onClick={rejectCall} style={{...styles.button, ...styles.buttonDanger, width:'auto'}}>📵 Reject</button>
                </div>
              </div>
            )}
            {(callStatus === 'calling' || callStatus === 'connecting' || callStatus === 'connected') && (
              <>
                {callStatus === 'calling' && (
                  <div style={styles.ringingAnimation}>
                    <div style={styles.ringDot}></div>
                    <div style={styles.ringDot}></div>
                    <div style={styles.ringDot}></div>
                  </div>
                )}
                {callStatus === 'connected' && (
                  <div style={styles.callTimer}>
                    {formatTime(callDuration)}
                  </div>
                )}
                <div style={styles.translation}>
                  <b>Translation Active:</b><br/>
                  {LANGUAGES.find(l => l.code === language)?.name} ↔ {LANGUAGES.find(l => l.code === remoteLanguage)?.name}
                </div>
                {callStatus === 'connected' && (
                  <div style={{...styles.info, color:'#22c55e',fontWeight:600}}>🎤 Speak now - your voice is being translated in real-time</div>
                )}
                <button onClick={endCall} style={{...styles.button, ...styles.buttonDanger}}>📵 End Call</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;