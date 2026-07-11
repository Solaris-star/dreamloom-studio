import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, GridComponent, TitleComponent, TooltipComponent, CanvasRenderer])

export { echarts }
