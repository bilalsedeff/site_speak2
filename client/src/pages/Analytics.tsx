import { useState } from 'react'
import { motion } from 'framer-motion'
import { useParams } from 'wouter'
import {
  TrendingUp,
  Users,
  Eye,
  Mic,
  MessageCircle,
  Download,
  RefreshCw
} from 'lucide-react'

import { Button } from '@/components/ui/Button'

// Sample analytics data
const ANALYTICS_DATA = {
  overview: {
    totalVisitors: 2847,
    pageViews: 12683,
    voiceInteractions: 1456,
    avgSessionDuration: '3m 24s',
    bounceRate: 42.3,
    conversionRate: 8.7,
  },
  trends: {
    visitorsChange: +12.4,
    pageViewsChange: +8.2,
    voiceInteractionsChange: +24.7,
    conversionsChange: +15.8,
  },
  topPages: [
    { path: '/', title: 'Homepage', views: 4521, voiceQueries: 234 },
    { path: '/products', title: 'Products', views: 3102, voiceQueries: 456 },
    { path: '/about', title: 'About Us', views: 1876, voiceQueries: 123 },
    { path: '/contact', title: 'Contact', views: 987, voiceQueries: 89 },
  ],
  voiceInsights: {
    topQueries: [
      { query: 'What products do you offer?', count: 234 },
      { query: 'How can I contact support?', count: 189 },
      { query: 'What are your prices?', count: 156 },
      { query: 'Do you offer shipping?', count: 134 },
    ],
    satisfactionScore: 4.6,
    responseTime: '1.2s',
  }
}

/**
 * Analytics Page following UI/UX guidelines:
 * - Dashboard layout with 3-column responsive grid
 * - Hero KPIs at top with secondary cards below
 * - Performance monitoring built-in
 */
export function Analytics() {
  const { siteId } = useParams()
  const [dateRange, setDateRange] = useState('7d')
  const [isLoading, setIsLoading] = useState(false)

  // Simulate data refresh
  const handleRefresh = () => {
    setIsLoading(true)
    setTimeout(() => setIsLoading(false), 1000)
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="layout-hero"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2 max-heading-width">
                Analytics Dashboard
                {siteId && (
                  <span className="text-lg text-muted-foreground font-normal ml-2">
                    · {siteId}
                  </span>
                )}
              </h1>
              <p className="text-muted-foreground max-reading-width">
                Track your site performance and voice assistant engagement
              </p>
            </div>

            <div className="flex items-center space-x-3">
              {/* Date Range Filter */}
              <div className="flex items-center space-x-1 bg-muted rounded-lg p-1">
                {[
                  { value: '24h', label: '24H' },
                  { value: '7d', label: '7D' },
                  { value: '30d', label: '30D' },
                  { value: '90d', label: '90D' },
                ].map(({ value, label }) => (
                  <Button
                    key={value}
                    variant={dateRange === value ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setDateRange(value)}
                    className="touch-target-ios"
                  >
                    {label}
                  </Button>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
                className="touch-target"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="touch-target"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Key Metrics - Hero KPIs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="layout-dashboard mb-8"
        >
          <MetricCard
            title="Total Visitors"
            value={ANALYTICS_DATA.overview.totalVisitors.toLocaleString()}
            change={ANALYTICS_DATA.trends.visitorsChange}
            icon={Users}
            color="blue"
          />

          <MetricCard
            title="Page Views"
            value={ANALYTICS_DATA.overview.pageViews.toLocaleString()}
            change={ANALYTICS_DATA.trends.pageViewsChange}
            icon={Eye}
            color="green"
          />

          <MetricCard
            title="Voice Interactions"
            value={ANALYTICS_DATA.overview.voiceInteractions.toLocaleString()}
            change={ANALYTICS_DATA.trends.voiceInteractionsChange}
            icon={Mic}
            color="purple"
          />
        </motion.div>

        {/* Secondary Metrics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="layout-dashboard mb-8"
        >
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4 max-heading-width">
              Performance Metrics
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {ANALYTICS_DATA.overview.avgSessionDuration}
                </div>
                <div className="text-sm text-muted-foreground">Avg. Session</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {ANALYTICS_DATA.overview.bounceRate}%
                </div>
                <div className="text-sm text-muted-foreground">Bounce Rate</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {ANALYTICS_DATA.overview.conversionRate}%
                </div>
                <div className="text-sm text-muted-foreground">Conversion</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {ANALYTICS_DATA.voiceInsights.satisfactionScore}
                </div>
                <div className="text-sm text-muted-foreground">Voice Score</div>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4 max-heading-width">
              Top Pages
            </h3>
            <div className="space-y-3">
              {ANALYTICS_DATA.topPages.map((page) => (
                <div key={page.path} className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate max-heading-width">
                      {page.title}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {page.path}
                    </div>
                  </div>
                  <div className="flex items-center space-x-6 text-sm">
                    <div className="text-center">
                      <div className="font-medium">{page.views.toLocaleString()}</div>
                      <div className="text-muted-foreground">Views</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium">{page.voiceQueries}</div>
                      <div className="text-muted-foreground">Voice</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4 max-heading-width">
              Voice Insights
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Response Time</div>
                <div className="font-medium">
                  {ANALYTICS_DATA.voiceInsights.responseTime}
                </div>
              </div>
              
              <div>
                <div className="text-sm text-muted-foreground mb-2">Top Voice Queries</div>
                <div className="space-y-2">
                  {ANALYTICS_DATA.voiceInsights.topQueries.slice(0, 3).map((query, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span className="truncate max-reading-width">{query.query}</span>
                      <span className="text-muted-foreground ml-2">{query.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Real-time Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-border rounded-lg p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-lg max-heading-width">
              Real-time Activity
            </h3>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>Live</span>
            </div>
          </div>

          <div className="space-y-4">
            {/* Recent Activities */}
            <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar">
              {[
                { time: '2 min ago', action: 'Voice query', details: '"What are your business hours?"', icon: Mic },
                { time: '3 min ago', action: 'Page view', details: '/products', icon: Eye },
                { time: '5 min ago', action: 'Voice interaction', details: 'Product search completed', icon: MessageCircle },
                { time: '8 min ago', action: 'New visitor', details: 'From Google Search', icon: Users },
              ].map((activity, index) => {
                const Icon = activity.icon
                return (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">
                        <span className="font-medium">{activity.action}</span>
                        <span className="text-muted-foreground ml-2">{activity.details}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{activity.time}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

// Metric Card Component
interface MetricCardProps {
  title: string
  value: string
  change: number
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  color: 'blue' | 'green' | 'purple'
}

function MetricCard({ title, value, change, icon: Icon, color }: MetricCardProps) {
  const colorClasses = {
    blue: 'bg-blue-500/10 text-blue-600',
    green: 'bg-green-500/10 text-green-600',
    purple: 'bg-purple-500/10 text-purple-600',
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground font-medium">{title}</div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="text-3xl font-bold">{value}</div>
        <div className="flex items-center space-x-1">
          <TrendingUp className={`h-4 w-4 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`} />
          <span className={`text-sm font-medium ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {change >= 0 ? '+' : ''}{change}%
          </span>
          <span className="text-sm text-muted-foreground">vs last period</span>
        </div>
      </div>
    </div>
  )
}

export default Analytics
