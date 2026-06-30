interface StatusBadgeProps {
  online: boolean;
  label?: string;
}

function StatusBadge({ online, label }: StatusBadgeProps) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 'var(--font-size-xs)',
      color: 'var(--color-text-muted)',
    }}>
      <span style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: online ? '#27d7a2' : '#f87171',
        boxShadow: online
          ? '0 0 6px rgba(39, 215, 162, 0.4)'
          : '0 0 6px rgba(248, 113, 113, 0.3)',
      }} />
      {label ?? (online ? '已连接' : '未连接')}
    </span>
  );
}

export default StatusBadge;
