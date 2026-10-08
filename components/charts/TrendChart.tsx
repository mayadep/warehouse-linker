import type { TrendPoint } from "@/modules/dashboard/queries";

const W = 560;
const H = 220;
const PAD = { top: 16, right: 8, bottom: 28, left: 32 };

/** 위쪽 눈금 최댓값: 1·2·5 단위로 올림 */
function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** 입고·출고 건수 묶음 막대 차트 (SVG, 서버 렌더). 색뿐 아니라 범례 글자와 막대 위 숫자로도 구분한다 */
export default function TrendChart({ data }: { data: TrendPoint[] }) {
  const max = niceMax(Math.max(...data.map((d) => Math.max(d.inCount, d.outCount)), 0));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / data.length;
  const barW = Math.min(20, slot / 3);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);

  return (
    <figure>
      <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-1" aria-hidden="true" />
          입고
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-3" aria-hidden="true" />
          출고
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="최근 일자별 입고·출고 건수" className="h-auto w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          const bars = [
            { v: d.inCount, x: cx - barW - 1, cls: "fill-chart-1" },
            { v: d.outCount, x: cx + 1, cls: "fill-chart-3" },
          ];
          return (
            <g key={d.date}>
              {bars.map((b) => (
                <g key={b.x}>
                  <rect x={b.x} y={y(b.v)} width={barW} height={Math.max(0, PAD.top + plotH - y(b.v))} rx={2} className={b.cls} />
                  {b.v > 0 && (
                    <text x={b.x + barW / 2} y={y(b.v) - 4} textAnchor="middle" className="fill-foreground text-[10px] font-medium">
                      {b.v}
                    </text>
                  )}
                </g>
              ))}
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>최근 일자별 입고·출고 건수</caption>
        <thead>
          <tr>
            <th>일자</th>
            <th>입고</th>
            <th>출고</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.inCount}</td>
              <td>{d.outCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
