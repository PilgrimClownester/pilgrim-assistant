import { useCallback, useRef, useState } from 'react';
import { getAmbientMusicUrl } from '../../api/client';
import './AmbientMusicPlayer.css';

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function AmbientMusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const userPausedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [unavailable, setUnavailable] = useState(false);

  const tryAutoplay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || userPausedRef.current || !audio.paused) return;
    void audio.play().catch(() => setPlaying(false));
  }, []);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      userPausedRef.current = false;
      setUnavailable(false);
      void audio.play().catch(() => setUnavailable(true));
    } else {
      userPausedRef.current = true;
      audio.pause();
    }
  };

  const seek = (value: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = value;
    setCurrentTime(value);
  };

  return (
    <section className="ambient-music" aria-label="轻音乐播放器">
      <div className="ambient-music-mark" aria-hidden="true">♪</div>
      <div className="ambient-music-body">
        <div className="ambient-music-title">
          <span><strong>天空之城</strong><small>{unavailable ? '暂时无法播放' : '钢琴纯音乐'}</small></span>
          <time>{formatTime(currentTime)} / {formatTime(duration)}</time>
        </div>
        <input
          className="ambient-music-progress"
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label="音乐播放进度"
          style={{ '--music-progress': `${duration ? currentTime / duration * 100 : 0}%` } as React.CSSProperties}
        />
      </div>
      <button className={`ambient-music-toggle${playing ? ' is-playing' : ''}`} type="button" onClick={togglePlayback} aria-label={playing ? '暂停音乐' : '播放音乐'}>
        <i aria-hidden="true" />
      </button>
      <audio
        ref={audioRef}
        src={getAmbientMusicUrl()}
        preload="metadata"
        autoPlay
        loop
        onCanPlay={tryAutoplay}
        onPlay={() => { setPlaying(true); setUnavailable(false); }}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(event) => {
          event.currentTarget.volume = 0.35;
          setDuration(event.currentTarget.duration);
        }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onError={() => { setPlaying(false); setUnavailable(true); }}
      />
    </section>
  );
}

export default AmbientMusicPlayer;
