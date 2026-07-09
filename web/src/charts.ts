// charts.ts — ECharts helpers (tree-shaken imports). Colors and chrome follow
// the validated dark palette in styles.css; text stays in ink tokens, marks
// carry identity.
import * as echarts from 'echarts/core';
import { LineChart, BarChart, GaugeChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { t, fmtDate, fmtNum } from './i18n';
import type { SeriesData, HormuzEvent } from './types';

echarts.use([LineChart, BarChart, GaugeChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

const INK2 = '#c3c2b7';
const MUTED = '#898781';
const GRID = '#2c2c2a';
const BLUE = '#3987e5';

const axisBase = {
  axisLine: { lineStyle: { color: GRID } },
  axisLabel: { color: MUTED, fontSize: 10 },
  splitLine: { lineStyle: { color: GRID } },
  axisTick: { show: false },
};

export function makeGauge(el: HTMLElement) {
  const chart = echarts.init(el, undefined, { renderer: 'canvas' });
  chart.setOption({
    series: [{
      type: 'gauge',
      min: 0, max: 100,
      startAngle: 210, endAngle: -30,
      axisLine: {
        lineStyle: {
          width: 12,
          // HPI band ranges: <30 critical, 30–55 serious, 55–80 warning, ≥80 good
          color: [[0.3, '#d03b3b'], [0.55, '#ec835a'], [0.8, '#fab219'], [1, '#0ca30c']],
        },
      },
      pointer: { length: '58%', width: 4, itemStyle: { color: '#ffffff' } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      title: { show: false },
      detail: {
        fontSize: 30, fontWeight: 700, color: '#ffffff',
        offsetCenter: [0, '65%'],
        formatter: (v: number) => `${Math.round(v)}`,
      },
      data: [{ value: 0 }],
    }],
  });
  return chart;
}

export function setGauge(chart: echarts.ECharts, hpi: number) {
  chart.setOption({ series: [{ data: [{ value: hpi }] }] });
}

export function makeSparkline(el: HTMLElement, data: SeriesData, baseline: number) {
  const chart = echarts.init(el);
  chart.setOption({
    grid: { left: 30, right: 8, top: 8, bottom: 18 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1a1a19', borderColor: GRID, textStyle: { color: INK2, fontSize: 11 },
      valueFormatter: (v: number) => fmtNum(v, 0),
    },
    xAxis: { type: 'time', ...axisBase, splitLine: { show: false } },
    yAxis: { type: 'value', max: Math.max(baseline * 1.1, 40), ...axisBase },
    series: [{
      type: 'bar',
      data,
      itemStyle: { color: BLUE, borderRadius: [2, 2, 0, 0] },
      barCategoryGap: '25%',
      markLine: {
        symbol: 'none', silent: true,
        lineStyle: { color: MUTED, type: 'dashed', width: 1 },
        label: { color: MUTED, fontSize: 10, formatter: `${t('baseline')} ${baseline}` },
        data: [{ yAxis: baseline }],
      },
    }],
  } as any);
  return chart;
}

export function makeBrentChart(el: HTMLElement, daily: SeriesData, events: HormuzEvent[], lang: string) {
  const chart = echarts.init(el);
  chart.setOption({
    grid: { left: 42, right: 10, top: 14, bottom: 22 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1a1a19', borderColor: GRID, textStyle: { color: INK2, fontSize: 11 },
      axisPointer: { type: 'cross', label: { backgroundColor: '#383835' } },
      valueFormatter: (v: number) => `$${fmtNum(v, 2)}`,
    },
    xAxis: { type: 'time', ...axisBase, splitLine: { show: false } },
    yAxis: { type: 'value', scale: true, ...axisBase },
    series: [{
      type: 'line',
      data: daily,
      showSymbol: false,
      lineStyle: { color: BLUE, width: 2 },
      itemStyle: { color: BLUE },
      areaStyle: { color: BLUE, opacity: 0.07 },
      // hand-curated political/military events as vertical reference lines
      markLine: {
        symbol: 'none',
        lineStyle: { color: MUTED, type: 'dashed', width: 1, opacity: 0.7 },
        // labels collide at panel width — shown on hover only
        label: { show: false },
        emphasis: {
          label: {
            show: true, position: 'insideEndTop', color: INK2, fontSize: 10,
            formatter: (p: any) => p.name,
            width: 140, overflow: 'break',
            backgroundColor: '#1a1a19', padding: 4,
          },
        },
        data: events.map((e) => ({
          xAxis: Date.parse(e.ts),
          name: lang === 'fi' ? e.fi : e.en,
        })),
      },
    }],
  } as any);
  return chart;
}

/** Replace the line data of an existing Brent chart (intraday tick appended). */
export function updateBrentChart(chart: echarts.ECharts, daily: SeriesData) {
  chart.setOption({ series: [{ data: daily }] } as any);
}

export function bindResize(...charts: echarts.ECharts[]) {
  window.addEventListener('resize', () => charts.forEach((c) => c.resize()), { passive: true });
}
