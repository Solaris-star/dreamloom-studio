import * as echarts from 'echarts/core'
import { HeatmapChart, LineChart } from 'echarts/charts'
import {
  CalendarComponent,
  GridComponent,
  TooltipComponent,
  VisualMapComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  HeatmapChart,
  LineChart,
  CalendarComponent,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer
])

export { echarts }
