import { ReactNode, CSSProperties } from 'react';

interface FrostedCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

function FrostedCard({ children, className = '', style }: FrostedCardProps) {
  return (
    <div className={`frosted-card ${className}`} style={style}>
      {children}
    </div>
  );
}

export default FrostedCard;
