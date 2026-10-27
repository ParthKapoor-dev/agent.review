const KEYS: [string, string][] = [
  ["← ↑ ↓ →  or  h j k l", "Move to the nearest card in that direction"],
  ["1 – 9", "Jump to frame (column) n"],
  ["0  /  esc", "Fit everything (esc first closes panels)"],
  ["⏎", "Open the selected card"],
  ["v  /  V", "Next / previous variant"],
  ["c", "Compare on/off (against the parent variant)"],
  ["s", "Side by side / overlay"],
  ["shift-click a variant", "Compare against it"],
  [", / .", "Previous / next view"],
  ["r", "Mark the card verified"],
  ["x", "Flag the card"],
  ["m", "Comment on the card"],
  ["t,  [  ]", "Start the tour, previous / next stop"],
  ["b", "Show / hide the brief"],
  ["/", "Search"],
  ["scroll · pinch", "Pan · zoom"],
];

export function Help({ onClose }: { onClose(): void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="help" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard</h2>
        <table>
          <tbody>
            {KEYS.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Colours</h2>
        <div className="legend">
          <span className="lg lg-added">New in this variant</span>
          <span className="lg lg-changed">Changed</span>
          <span className="lg lg-removed">Removed (ghost)</span>
          <span className="lg lg-scope">Not requested</span>
        </div>
      </div>
    </div>
  );
}
