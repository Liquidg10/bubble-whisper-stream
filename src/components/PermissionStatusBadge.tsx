import { Badge } from "@/components/ui/badge";
import { Shield, Eye, Edit, Send } from "lucide-react";

interface PermissionStatusBadgeProps {
  level: string;
  service: 'calendar' | 'gmail';
}

export function PermissionStatusBadge({ level, service }: PermissionStatusBadgeProps) {
  const getPermissionInfo = () => {
    if (service === 'calendar') {
      switch (level) {
        case 'write':
          return { icon: Edit, label: 'Full Access', variant: 'default' as const };
        case 'read':
          return { icon: Eye, label: 'Read Only', variant: 'secondary' as const };
        default:
          return { icon: Shield, label: 'No Access', variant: 'outline' as const };
      }
    } else {
      switch (level) {
        case 'send':
          return { icon: Send, label: 'Full Access', variant: 'default' as const };
        case 'compose':
          return { icon: Edit, label: 'Compose Access', variant: 'default' as const };
        case 'read':
          return { icon: Eye, label: 'Read Access', variant: 'secondary' as const };
        case 'minimal':
          return { icon: Shield, label: 'Headers Only', variant: 'outline' as const };
        default:
          return { icon: Shield, label: 'No Access', variant: 'outline' as const };
      }
    }
  };

  const { icon: Icon, label, variant } = getPermissionInfo();

  return (
    <Badge variant={variant} className="flex items-center gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}