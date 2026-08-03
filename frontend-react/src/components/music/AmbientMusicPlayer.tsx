import './AmbientMusicPlayer.css';

const PLAYER_URL = 'https://music.163.com/outchain/player?type=2&id=1803814925&auto=1&height=66';

function AmbientMusicPlayer() {
  return (
    <section className="ambient-music" aria-label="轻音乐播放器">
      <div className="ambient-music-label" aria-hidden="true">
        <span>♪</span>
        <strong>轻音乐</strong>
      </div>
      <iframe
        title="天空之城纯音乐钢琴"
        src={PLAYER_URL}
        width="300"
        height="86"
        frameBorder="0"
        loading="lazy"
        allow="autoplay"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </section>
  );
}

export default AmbientMusicPlayer;
