import { Clock, Map, Palette, Monitor, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { PerformanceMonitor } from "./PerformanceMonitor";
import { useUILayout } from "@/hooks/useUILayout";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { 
    togglePanel, 
    toggleFocusMode, 
    isPanelVisible, 
    focusMode 
  } = useUILayout();

  const handleToggleTimeline = () => togglePanel('temporal');
  const handleToggleMinimap = () => togglePanel('minimap');
  const handleTogglePerformance = () => togglePanel('performance');

  return (
    <Sidebar
      className={collapsed ? "w-14" : "w-64"}
      collapsible="icon"
    >
      <SidebarContent className="p-2">
        <SidebarGroup>
          <SidebarGroupLabel>
            {!collapsed && "Controls"}
          </SidebarGroupLabel>
          
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={handleToggleTimeline}
                  className={isPanelVisible('temporal') ? "bg-muted" : ""}
                >
                  <Clock className="h-4 w-4" />
                  {!collapsed && <span>Timeline Navigator</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={handleToggleMinimap}
                  className={isPanelVisible('minimap') ? "bg-muted" : ""}
                >
                  <Map className="h-4 w-4" />
                  {!collapsed && <span>Mini Map</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={handleTogglePerformance}
                  className={isPanelVisible('performance') ? "bg-muted" : ""}
                >
                  <Monitor className="h-4 w-4" />
                  {!collapsed && <span>Performance Monitor</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && <Separator className="my-2" />}

        <SidebarGroup>
          <SidebarGroupLabel>
            {!collapsed && "Appearance"}
          </SidebarGroupLabel>
          
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <Palette className="h-4 w-4" />
                  {!collapsed && (
                    <div className="flex-1">
                      <ThemeToggle />
                    </div>
                  )}
                </div>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && <Separator className="my-2" />}

        <SidebarGroup>
          <SidebarGroupLabel>
            {!collapsed && "Focus"}
          </SidebarGroupLabel>
          
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={toggleFocusMode}
                  className={focusMode ? "bg-muted" : ""}
                >
                  <Settings className="h-4 w-4" />
                  {!collapsed && <span>Focus Mode</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && isPanelVisible('performance') && (
          <>
            <Separator className="my-2" />
            <div className="px-2">
              <PerformanceMonitor />
            </div>
          </>
        )}
      </SidebarContent>
    </Sidebar>
  );
}