'use client';

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface Rule {
  minCount: number;
  maxCount: number | null;
  percentage: number;
}

interface PolicySnapshotProps {
  accountGroups: { name: string; rules: Rule[] }[];
  channelConfigs: { name: string; rules: Rule[] }[];
}

export function PolicySnapshot({ accountGroups, channelConfigs }: PolicySnapshotProps) {
  const formatRule = (rule: Rule) => {
    if (rule.maxCount === null) {
      return `> ${rule.minCount} 单`;
    }
    return `${rule.minCount} - ${rule.maxCount} 单`;
  };

  const copyToClipboard = (type: 'groups' | 'channels') => {
    let text = "";
    if (type === 'groups') {
      text = "【账号组提成政策】\n\n";
      accountGroups.forEach(group => {
        text += `=== ${group.name} ===\n`;
        group.rules.forEach(rule => {
          text += `${formatRule(rule)}: ${rule.percentage}%\n`;
        });
        text += "\n";
      });
    } else {
      text = "【渠道提成政策】\n\n";
      channelConfigs.forEach(channel => {
        text += `=== ${channel.name} ===\n`;
        channel.rules.forEach(rule => {
          text += `${formatRule(rule)}: ${rule.percentage}%\n`;
        });
        text += "\n";
      });
    }

    navigator.clipboard.writeText(text);
    toast.success("已复制到剪贴板");
  };

  const copySingleToClipboard = (name: string, rules: Rule[], titlePrefix: string) => {
    let text = `${titlePrefix}\n\n`;
    text += `=== ${name} ===\n`;
    rules.forEach(rule => {
      text += `${formatRule(rule)}: ${rule.percentage}%\n`;
    });
    
    navigator.clipboard.writeText(text);
    toast.success(`${name} 政策已复制`);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">查看提成政策快照</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>提成政策快照</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="groups" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="groups">账号组政策</TabsTrigger>
            <TabsTrigger value="channels">渠道政策</TabsTrigger>
          </TabsList>
          
          <TabsContent value="groups" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" onClick={() => copyToClipboard('groups')}>
                <Copy className="mr-2 h-4 w-4" /> 复制全部内容
              </Button>
            </div>
            <div className="space-y-6">
              {accountGroups.map((group) => (
                <div key={group.name} className="border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold">{group.name}</h3>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8" 
                      onClick={() => copySingleToClipboard(group.name, group.rules, '【账号组提成政策】')}
                      title="复制此政策"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>单量区间</TableHead>
                        <TableHead>提成点数</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rules.map((rule, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{formatRule(rule)}</TableCell>
                          <TableCell>{rule.percentage}%</TableCell>
                        </TableRow>
                      ))}
                      {group.rules.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center text-muted-foreground">暂无规则</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="channels" className="space-y-4">
             <div className="flex justify-end">
              <Button size="sm" variant="secondary" onClick={() => copyToClipboard('channels')}>
                <Copy className="mr-2 h-4 w-4" /> 复制全部内容
              </Button>
            </div>
            <div className="space-y-6">
              {channelConfigs.map((channel) => (
                <div key={channel.name} className="border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold">{channel.name}</h3>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8" 
                      onClick={() => copySingleToClipboard(channel.name, channel.rules, '【渠道提成政策】')}
                      title="复制此政策"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>单量区间</TableHead>
                        <TableHead>渠道成本点数</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {channel.rules.map((rule, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{formatRule(rule)}</TableCell>
                          <TableCell>{rule.percentage}%</TableCell>
                        </TableRow>
                      ))}
                       {channel.rules.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center text-muted-foreground">暂无规则</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
