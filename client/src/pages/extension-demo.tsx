import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Search, Settings, BarChart3, Download, Users, Eye, Shield, Zap } from "lucide-react";

export default function ExtensionDemo() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <Eye className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Storylister</h1>
                <p className="text-sm text-muted-foreground">Instagram Story Viewer Enhancement</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <a href="/mock-instagram" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
                Test Live Demo
              </a>
              <Badge variant="secondary">Chrome Extension</Badge>
              <Badge variant="default">v1.0.0</Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12">
          
          {/* Main Demo */}
          <div className="xl:col-span-2">
            <Card className="shadow-lg overflow-hidden">
              <div className="bg-gray-900 p-3 flex items-center space-x-2">
                <div className="flex space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
                <div className="flex-1 text-center">
                  <div className="bg-gray-700 rounded px-3 py-1 text-xs text-gray-300 inline-block">
                    instagram.com/stories/username/
                  </div>
                </div>
              </div>
              
              {/* Simulated Instagram Interface */}
              <div className="relative h-96 bg-gradient-to-br from-purple-400 via-pink-500 to-red-500 flex items-center justify-center">
                
                {/* Mock Instagram Story Viewer Dialog */}
                <div className="relative">
                  {/* Instagram's native viewer dialog (background) */}
                  <div className="bg-white rounded-xl shadow-2xl w-80 max-h-96 overflow-hidden">
                    <div className="p-4 border-b border-gray-200">
                      <h3 className="font-semibold text-gray-900">Seen by 2,487</h3>
                    </div>
                    
                    {/* Storylister Extension Overlay */}
                    <Card className="absolute top-0 right-0 w-72 shadow-xl z-50" style={{transform: 'translate(100%, 0)'}}>
                      {/* Extension Header */}
                      <CardHeader className="p-3 pb-2 bg-muted/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className="w-5 h-5 rounded bg-primary flex items-center justify-center">
                              <Eye className="w-3 h-3 text-primary-foreground" />
                            </div>
                            <span className="text-sm font-medium">Storylister</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Badge variant="secondary" className="text-xs px-2 py-1">Pro</Badge>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="p-3 space-y-3">
                        {/* Search Bar */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input 
                            type="text" 
                            placeholder="Search viewers..." 
                            className="pl-10 h-8 text-sm"
                          />
                        </div>

                        {/* Filters Row */}
                        <div className="flex items-center justify-between text-xs">
                          <select className="px-2 py-1 border border-border rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                            <option>All viewers</option>
                            <option>Followers only</option>
                            <option>Non-followers</option>
                            <option>Frequent viewers</option>
                          </select>
                          <select className="px-2 py-1 border border-border rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                            <option>Recent first</option>
                            <option>Oldest first</option>
                            <option>A-Z</option>
                            <option>Most active</option>
                          </select>
                        </div>

                        {/* Stats Bar */}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Loaded 847 / 2,487 viewers</span>
                          <div className="flex items-center space-x-2">
                            <Progress value={34} className="w-12 h-1" />
                            <span>34%</span>
                          </div>
                        </div>

                        {/* Pro Actions */}
                        <div className="flex space-x-2">
                          <Button size="sm" className="flex-1 text-xs h-8">
                            📸 Capture Snapshot
                          </Button>
                          <Button variant="outline" size="sm" className="text-xs h-8">
                            📊 Analytics
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Mock viewer list */}
                    <div className="overflow-y-auto max-h-64">
                      <div className="p-3 border-b border-gray-100 hover:bg-gray-50 flex items-center space-x-3 cursor-pointer">
                        <div className="w-8 h-8 rounded-full bg-gray-300"></div>
                        <div className="flex-1">
                          <div className="font-medium text-sm text-gray-900">john_doe_92</div>
                          <div className="text-xs text-gray-500">John Doe</div>
                        </div>
                        <div className="text-xs text-gray-400">2h</div>
                      </div>
                      
                      <div className="p-3 border-b border-gray-100 hover:bg-gray-50 flex items-center space-x-3 cursor-pointer">
                        <div className="w-8 h-8 rounded-full bg-gray-300"></div>
                        <div className="flex-1">
                          <div className="font-medium text-sm text-gray-900">sarah_smith</div>
                          <div className="text-xs text-gray-500">Sarah Smith</div>
                        </div>
                        <div className="text-xs text-gray-400">5h</div>
                      </div>
                      
                      <div className="p-3 border-b border-gray-100 hover:bg-gray-50 flex items-center space-x-3 cursor-pointer">
                        <div className="w-8 h-8 rounded-full bg-gray-300"></div>
                        <div className="flex-1">
                          <div className="font-medium text-sm text-gray-900">mike_photography</div>
                          <div className="text-xs text-gray-500">Mike Johnson</div>
                        </div>
                        <div className="text-xs text-gray-400">12h</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Feature Overview */}
          <div className="space-y-6">
            {/* Free Features */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                    <Search className="w-5 h-5 text-secondary-foreground" />
                  </div>
                  <CardTitle className="text-lg">Free Features</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-4 h-4 text-green-500">✓</div>
                  <span>Real-time viewer search</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-4 h-4 text-green-500">✓</div>
                  <span>Smart filtering options</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-4 h-4 text-green-500">✓</div>
                  <span>Sort by activity</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-4 h-4 text-green-500">✓</div>
                  <span>Load progress tracking</span>
                </div>
              </CardContent>
            </Card>

            {/* Pro Features */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                    <Zap className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <CardTitle className="text-lg">Pro Features</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-4 h-4 text-primary">✓</div>
                  <span>Snapshot capture & history</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-4 h-4 text-primary">✓</div>
                  <span>Viewer analytics & trends</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-4 h-4 text-primary">✓</div>
                  <span>Custom viewer notes</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-4 h-4 text-primary">✓</div>
                  <span>CSV data export</span>
                </div>
                <Button className="w-full mt-4">
                  Upgrade to Pro
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Analytics Dashboard */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Analytics Dashboard</CardTitle>
                <p className="text-sm text-muted-foreground">Viewer engagement insights and trends</p>
              </div>
              <Badge>Pro Feature</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {/* Stats Cards */}
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">2,487</div>
                  <div className="text-sm text-muted-foreground">Total Viewers</div>
                  <div className="text-xs text-green-600 mt-1">↗️ +12% from last week</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">347</div>
                  <div className="text-sm text-muted-foreground">Frequent Viewers</div>
                  <div className="text-xs text-green-600 mt-1">↗️ +8% from last week</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">1,854</div>
                  <div className="text-sm text-muted-foreground">Unique Viewers</div>
                  <div className="text-xs text-red-600 mt-1">↘️ -3% from last week</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">73.2%</div>
                  <div className="text-sm text-muted-foreground">Return Rate</div>
                  <div className="text-xs text-green-600 mt-1">↗️ +5% from last week</div>
                </CardContent>
              </Card>
            </div>

            {/* Top Viewers List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Most Active Viewers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-gray-300"></div>
                    <div>
                      <div className="font-medium text-sm">sarah_smith</div>
                      <div className="text-xs text-muted-foreground">Viewed 24/25 recent stories</div>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-primary">96%</div>
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-gray-300"></div>
                    <div>
                      <div className="font-medium text-sm">mike_photography</div>
                      <div className="text-xs text-muted-foreground">Viewed 21/25 recent stories</div>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-primary">84%</div>
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-gray-300"></div>
                    <div>
                      <div className="font-medium text-sm">alex_travels</div>
                      <div className="text-xs text-muted-foreground">Viewed 19/25 recent stories</div>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-primary">76%</div>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        {/* Extension Settings Panel */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                <Settings className="w-5 h-5 text-accent-foreground" />
              </div>
              <CardTitle className="text-xl">Extension Settings</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* General Settings */}
              <div className="space-y-4">
                <h4 className="font-medium">General</h4>
                
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Auto-load viewers</div>
                    <div className="text-xs text-muted-foreground">Automatically load more viewers as you scroll</div>
                  </div>
                  <div className="relative">
                    <input type="checkbox" className="sr-only" defaultChecked />
                    <div className="block w-10 h-6 bg-primary rounded-full cursor-pointer">
                      <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full transition-transform"></div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Show overlay on load</div>
                    <div className="text-xs text-muted-foreground">Display Storylister panel automatically</div>
                  </div>
                  <div className="relative">
                    <input type="checkbox" className="sr-only" defaultChecked />
                    <div className="block w-10 h-6 bg-primary rounded-full cursor-pointer">
                      <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full transition-transform"></div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Default sort order</label>
                  <select className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm">
                    <option>Most recent first</option>
                    <option>Alphabetical (A-Z)</option>
                    <option>Most active viewers</option>
                  </select>
                </div>
              </div>

              {/* Privacy Settings */}
              <div className="space-y-4">
                <h4 className="font-medium">Privacy & Data</h4>
                
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Local data only</div>
                    <div className="text-xs text-muted-foreground">All data stays on your device</div>
                  </div>
                  <div className="relative">
                    <input type="checkbox" className="sr-only" defaultChecked disabled />
                    <div className="block w-10 h-6 bg-green-500 rounded-full cursor-not-allowed">
                      <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full"></div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Data retention</label>
                  <select className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm">
                    <option>30 days</option>
                    <option>90 days</option>
                    <option>1 year</option>
                    <option>Forever</option>
                  </select>
                </div>

                <div className="pt-4 border-t border-border">
                  <Button variant="destructive" className="w-full">
                    Clear All Data
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <footer className="bg-card border-t border-border mt-16">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center text-sm text-muted-foreground">
            <p>Storylister Chrome Extension - Enhance your Instagram story viewer experience</p>
            <p className="mt-1">Privacy-first • Local data only • No automation</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
