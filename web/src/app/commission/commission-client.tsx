'use client';

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { 
  upsertAccountGroup, 
  deleteAccountGroup, 
  upsertChannelConfig, 
  deleteChannelConfig,
  CommissionRuleInput 
} from "./actions";
import { RuleEditor } from "./rule-editor";
import { PolicySnapshot } from "./policy-snapshot";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { format } from "date-fns";

interface CommissionClientProps {
  initialAccountGroups: any[];
  initialChannelConfigs: any[];
  users: any[];
}

export default function CommissionClient({ initialAccountGroups, initialChannelConfigs, users }: CommissionClientProps) {
  const router = useRouter();
  const [accountGroups, setAccountGroups] = useState(initialAccountGroups);
  const [channelConfigs, setChannelConfigs] = useState(initialChannelConfigs);
  const [activeTab, setActiveTab] = useState("groups");

  useEffect(() => {
    setAccountGroups(initialAccountGroups);
    setChannelConfigs(initialChannelConfigs);
  }, [initialAccountGroups, initialChannelConfigs]);

  // --- Dialog States ---
  // Group Basic Info
  const [isGroupBasicOpen, setIsGroupBasicOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<{ id?: string, name: string, description: string, settlementByCompleted: boolean } | null>(null);

  // User Selection
  const [isUserSelectOpen, setIsUserSelectOpen] = useState(false);
  const [userSelectGroupId, setUserSelectGroupId] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Policy Manager
  const [isPolicyManagerOpen, setIsPolicyManagerOpen] = useState(false);
  const [policyManagerGroup, setPolicyManagerGroup] = useState<any>(null);

  // Channel Basic Info
  const [isChannelBasicOpen, setIsChannelBasicOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<{ id?: string, name: string, isEnabled: boolean, settlementByCompleted: boolean } | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type?: 'group' | 'channel';
    ownerId?: string;
  }>({ open: false });

  // --- Actions ---

  // 1. Group Basic
  const handleEditGroupBasic = (group?: any) => {
    if (group) {
      setEditingGroup({ id: group.id, name: group.name, description: group.description || '', settlementByCompleted: group.settlementByCompleted ?? true });
    } else {
      setEditingGroup({ name: '', description: '', settlementByCompleted: true });
    }
    setIsGroupBasicOpen(true);
  };

  const handleSaveGroupBasic = async () => {
    if (!editingGroup?.name) return toast.error("请输入名称");
    const res = await upsertAccountGroup({
      id: editingGroup.id,
      name: editingGroup.name,
      description: editingGroup.description,
      settlementByCompleted: editingGroup.settlementByCompleted
    });
    if (res.success) {
      toast.success("保存成功");
      setIsGroupBasicOpen(false);
      router.refresh();
    } else {
      toast.error("保存失败: " + res.error);
    }
  };

  // 2. User Selection
  const handleEditGroupUsers = (group: any) => {
    setUserSelectGroupId(group.id);
    setSelectedUserIds(group.users?.map((u: any) => u.id) || []);
    setIsUserSelectOpen(true);
  };

  const handleSaveGroupUsers = async () => {
    if (!userSelectGroupId) return;
    const res = await upsertAccountGroup({
      id: userSelectGroupId,
      name: accountGroups.find(g => g.id === userSelectGroupId).name, // Name required by upsert
      userIds: selectedUserIds
    });
    if (res.success) {
      toast.success("关联用户已更新");
      setIsUserSelectOpen(false);
      router.refresh();
    } else {
      toast.error("保存失败: " + res.error);
    }
  };

  // 3. Policy Manager
  const handleOpenPolicyManager = (group: any) => {
    setPolicyManagerGroup(group);
    setIsPolicyManagerOpen(true);
  };

  const handleSavePolicyManager = async (rules: CommissionRuleInput[], settlementByCompleted: boolean) => {
    if (!policyManagerGroup) return;
    const res = await upsertAccountGroup({
      id: policyManagerGroup.id,
      name: policyManagerGroup.name,
      rules: rules,
      settlementByCompleted: settlementByCompleted
    });

    if (res.success) {
        toast.success("规则配置已保存");
        setIsPolicyManagerOpen(false);
        router.refresh();
    } else {
        toast.error("保存失败: " + res.error);
    }
  };

  // 4. Channel Basic
  const handleEditChannelBasic = (channel?: any) => {
    if (channel) {
      setEditingChannel({ 
        id: channel.id, 
        name: channel.name, 
        isEnabled: channel.isEnabled ?? true,
        settlementByCompleted: channel.settlementByCompleted ?? true 
      });
    } else {
      setEditingChannel({ name: '', isEnabled: true, settlementByCompleted: true });
    }
    setIsChannelBasicOpen(true);
  };

  const handleSaveChannelBasic = async () => {
    if (!editingChannel?.name) return toast.error("请输入名称");
    const res = await upsertChannelConfig({
      id: editingChannel.id,
      name: editingChannel.name,
      isEnabled: editingChannel.isEnabled,
      settlementByCompleted: editingChannel.settlementByCompleted
    });
    if (res.success) {
      toast.success("保存成功");
      setIsChannelBasicOpen(false);
      router.refresh();
    } else {
      toast.error("保存失败: " + res.error);
    }
  };

  const handleToggleChannelStatus = async (channel: any, checked: boolean) => {
     const res = await upsertChannelConfig({
       id: channel.id,
       name: channel.name,
       isEnabled: checked,
       settlementByCompleted: channel.settlementByCompleted
     });
     if (res.success) {
       toast.success(checked ? "渠道已启用" : "渠道已禁用");
       router.refresh();
     } else {
       toast.error("更新状态失败");
     }
  };

  const openDeleteGroup = (id: string) => {
    setConfirmDialog({ open: true, type: 'group', ownerId: id });
  };

  const openDeleteChannel = (id: string) => {
    setConfirmDialog({ open: true, type: 'channel', ownerId: id });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDialog.type) return;
    if (confirmDialog.type === 'group' && confirmDialog.ownerId) {
      const res = await deleteAccountGroup(confirmDialog.ownerId);
      if (res.success) {
        setConfirmDialog({ open: false });
        router.refresh();
      } else {
        toast.error(res.error);
      }
    }
    if (confirmDialog.type === 'channel' && confirmDialog.ownerId) {
      const res = await deleteChannelConfig(confirmDialog.ownerId);
      if (res.success) {
        setConfirmDialog({ open: false });
        router.refresh();
      } else {
        toast.error(res.error);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <PolicySnapshot accountGroups={accountGroups} channelConfigs={channelConfigs} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="groups">账号组配置</TabsTrigger>
          <TabsTrigger value="channels">渠道管理</TabsTrigger>
        </TabsList>
        
        {/* --- Account Groups Tab --- */}
        <TabsContent value="groups" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => handleEditGroupBasic()}>
              <Plus className="mr-2 h-4 w-4" /> 新增账号组
            </Button>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accountGroups.map((group: any) => (
              <Card key={group.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg font-bold">{group.name}</CardTitle>
                    <div className="flex space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEditGroupBasic(group)} className="h-8 w-8">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => openDeleteGroup(group.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription>{group.description || "无描述"}</CardDescription>
                  {group.settlementByCompleted ? (
                    <div className="mt-2"><Badge variant="secondary">按已完成订单结算</Badge></div>
                  ) : (
                    <div className="mt-2"><Badge variant="outline">按创建时间结算</Badge></div>
                  )}
                </CardHeader>
                
                <CardContent className="space-y-6 flex-1">
                  {/* Associated Users */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">关联人员</h4>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleEditGroupUsers(group)}>
                        编辑
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                       {group.users && group.users.length > 0 ? (
                         <>
                            <div className="flex -space-x-2 overflow-hidden">
                              {group.users.slice(0, 5).map((u: any) => (
                                <TooltipProvider key={u.id}>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Avatar className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-slate-200">
                                        <AvatarFallback className="text-xs">{u.name?.[0] || u.username?.[0]}</AvatarFallback>
                                      </Avatar>
                                    </TooltipTrigger>
                                    <TooltipContent><p>{u.name || u.username}</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ))}
                            </div>
                            {group.users.length > 5 && (
                              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted text-xs font-medium ring-2 ring-white">
                                +{group.users.length - 5}
                              </div>
                            )}
                            <span className="text-xs text-muted-foreground ml-1">共 {group.users.length} 人</span>
                         </>
                       ) : (
                         <span className="text-sm text-muted-foreground italic">暂无关联</span>
                       )}
                    </div>
                  </div>

                  <Separator />

                  {/* Policy Configuration Button */}
                  <Button variant="outline" className="w-full" onClick={() => handleOpenPolicyManager(group)}>
                    <Settings2 className="mr-2 h-4 w-4" />
                    配置提成规则
                  </Button>
                  <div className="text-xs text-muted-foreground text-center">
                    包含 零售/同行/代理 等各渠道提成
                  </div>

                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* --- Channel Configs Tab --- */}
        <TabsContent value="channels" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => handleEditChannelBasic()}>
              <Plus className="mr-2 h-4 w-4" /> 新增渠道
            </Button>
          </div>

          <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>渠道名称</TableHead>
                        <TableHead>启用状态</TableHead>
                        <TableHead>结算模式</TableHead>
                        <TableHead>最近操作时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {channelConfigs.map((channel: any) => (
                        <TableRow key={channel.id}>
                            <TableCell className="font-medium">{channel.name}</TableCell>
                            <TableCell>
                                <Switch 
                                    checked={channel.isEnabled ?? true}
                                    onCheckedChange={(checked) => handleToggleChannelStatus(channel, checked)}
                                />
                            </TableCell>
                            <TableCell>
                                {channel.settlementByCompleted ? (
                                    <Badge variant="secondary">按已完成订单</Badge>
                                ) : (
                                    <Badge variant="outline">按创建时间</Badge>
                                )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                                {channel.updatedAt ? format(new Date(channel.updatedAt), 'yyyy-MM-dd HH:mm') : '-'}
                            </TableCell>
                            <TableCell className="text-right space-x-2">
                                <Button variant="ghost" size="sm" onClick={() => handleEditChannelBasic(channel)}>
                                    <Edit className="h-4 w-4 mr-1" /> 编辑
                                </Button>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => openDeleteChannel(channel.id)}>
                                    <Trash2 className="h-4 w-4 mr-1" /> 删除
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                    {channelConfigs.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                暂无渠道配置
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* --- Dialogs --- */}
      
      {/* 1. Group Basic Dialog */}
      <Dialog open={isGroupBasicOpen} onOpenChange={setIsGroupBasicOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingGroup?.id ? '编辑账号组' : '新建账号组'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>名称</Label>
              <Input value={editingGroup?.name || ''} onChange={e => setEditingGroup(prev => prev ? {...prev, name: e.target.value} : null)} />
            </div>
            <div className="grid gap-2">
              <Label>描述</Label>
              <Textarea value={editingGroup?.description || ''} onChange={e => setEditingGroup(prev => prev ? {...prev, description: e.target.value} : null)} />
            </div>
            <Button className="w-full" onClick={handleSaveGroupBasic}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 2. Channel Basic Dialog */}
      <Dialog open={isChannelBasicOpen} onOpenChange={setIsChannelBasicOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingChannel?.id ? '编辑渠道' : '新建渠道'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>名称</Label>
              <Input value={editingChannel?.name || ''} onChange={e => setEditingChannel(prev => prev ? {...prev, name: e.target.value} : null)} />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="channel-settlement-by-completed"
                checked={!!editingChannel?.settlementByCompleted}
                onCheckedChange={(checked) => {
                  setEditingChannel(prev => prev ? { ...prev, settlementByCompleted: checked === true } : null)
                }}
              />
              <label htmlFor="channel-settlement-by-completed" className="text-sm cursor-pointer select-none">
                按完结订单结算
              </label>
            </div>
            <Button className="w-full" onClick={handleSaveChannelBasic}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 3. User Selection Dialog */}
      <Dialog open={isUserSelectOpen} onOpenChange={setIsUserSelectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>关联人员</DialogTitle></DialogHeader>
          <div className="flex items-center justify-between my-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all-users"
                checked={
                  users.length > 0
                    ? selectedUserIds.length === users.length
                      ? true
                      : selectedUserIds.length > 0
                        ? "indeterminate"
                        : false
                    : false
                }
                onCheckedChange={(checked) => {
                  if (checked === true) {
                    setSelectedUserIds(users.map(u => u.id));
                  } else {
                    setSelectedUserIds([]);
                  }
                }}
              />
              <label htmlFor="select-all-users" className="text-sm cursor-pointer select-none">
                全选
              </label>
            </div>
            <span className="text-xs text-muted-foreground">已选 {selectedUserIds.length}</span>
          </div>
          <div className="border rounded-md p-4 max-h-60 overflow-y-auto grid grid-cols-2 gap-2">
              {users.map(user => (
                <div key={user.id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`u-${user.id}`} 
                    checked={selectedUserIds.includes(user.id)}
                    onCheckedChange={(checked) => {
                      setSelectedUserIds(prev => checked 
                        ? [...prev, user.id] 
                        : prev.filter(id => id !== user.id)
                      );
                    }}
                  />
                  <label htmlFor={`u-${user.id}`} className="text-sm cursor-pointer select-none">
                    {user.name || user.username}
                  </label>
                </div>
              ))}
              {users.length === 0 && <div className="text-muted-foreground text-sm col-span-2">无用户</div>}
          </div>
          <Button onClick={handleSaveGroupUsers}>保存关联</Button>
        </DialogContent>
      </Dialog>

      {/* 4. Policy Manager Dialog */}
      {isPolicyManagerOpen && policyManagerGroup && (
        <GroupPolicyManager 
            group={policyManagerGroup}
            channels={channelConfigs}
            isOpen={isPolicyManagerOpen}
            onOpenChange={setIsPolicyManagerOpen}
            onSave={handleSavePolicyManager}
        />
      )}

      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>确认删除</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground">
             {confirmDialog.type === 'group' ? '确认删除该账号组？' : '确认删除该渠道？'}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setConfirmDialog({ open: false })}>取消</Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function GroupPolicyManager({ 
    group, 
    channels, 
    isOpen, 
    onOpenChange, 
    onSave 
}: { 
    group: any, 
    channels: any[], 
    isOpen: boolean, 
    onOpenChange: (open: boolean) => void, 
    onSave: (rules: CommissionRuleInput[], settlementByCompleted: boolean) => Promise<void> 
}) {
    const [defaultRules, setDefaultRules] = useState<CommissionRuleInput[]>([]);
    const [channelRates, setChannelRates] = useState<Record<string, { employee: string, promoter: string }>>({});
    const [settlementByCompleted, setSettlementByCompleted] = useState(true);

    useEffect(() => {
        // Initialize rules
        const rules = group.rules || [];
        setSettlementByCompleted(group.settlementByCompleted ?? true);
        
        // Default rules: channelConfigId is null (Keep as Ladder)
        const def = rules.filter((r: any) => !r.channelConfigId);
        setDefaultRules(def.length ? def : []);

        // Channel rules (Convert to simple rates)
        const chMap: Record<string, { employee: string, promoter: string }> = {};
        channels.forEach(c => {
            const cRules = rules.filter((r: any) => r.channelConfigId === c.id);
            
            // Find first rule for employee (target=USER)
            const empRule = cRules.find((r: any) => (r.target || 'USER') === 'USER');
            // Find first rule for promoter (target=PROMOTER)
            const proRule = cRules.find((r: any) => r.target === 'PROMOTER');

            chMap[c.id] = {
                employee: empRule ? empRule.percentage.toString() : '0',
                promoter: proRule ? proRule.percentage.toString() : '0'
            };
        });
        setChannelRates(chMap);
    }, [group, channels]);

    const handleSave = async () => {
        // Flatten
        const allRules: CommissionRuleInput[] = [
            ...defaultRules.map(r => ({ ...r, target: 'USER', channelConfigId: undefined })),
        ];

        Object.entries(channelRates).forEach(([cid, rates]) => {
            // Create single flat rule for Employee
            allRules.push({
                minCount: 0,
                maxCount: null,
                percentage: parseFloat(rates.employee) || 0,
                target: 'USER',
                channelConfigId: cid
            });
            
            // Create single flat rule for Promoter
            allRules.push({
                minCount: 0,
                maxCount: null,
                percentage: parseFloat(rates.promoter) || 0,
                target: 'PROMOTER',
                channelConfigId: cid
            });
        });

        await onSave(allRules, settlementByCompleted);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[1000px] h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{group.name} - 提成规则配置</DialogTitle>
                </DialogHeader>

                <div className="flex items-center space-x-2 my-2 px-1">
                    <Checkbox
                        id="policy-settlement-by-completed"
                        checked={settlementByCompleted}
                        onCheckedChange={(checked) => setSettlementByCompleted(checked === true)}
                    />
                    <label htmlFor="policy-settlement-by-completed" className="text-sm cursor-pointer select-none font-medium">
                            按完结订单结算
                        </label>
                    <span className="text-xs text-muted-foreground ml-2">
                        (勾选：仅统计已完成订单；未勾选：统计所有创建的订单)
                    </span>
                </div>
                
                <div className="flex-1 overflow-hidden flex gap-4 mt-2">
                    <Tabs defaultValue="group_rules" className="flex-1 flex flex-col h-full">
                        <div className="flex items-center justify-between mb-4">
                            <TabsList className="w-full justify-start">
                                <TabsTrigger value="group_rules">账号组规则</TabsTrigger>
                                <TabsTrigger value="channel_rules">下属渠道配置</TabsTrigger>
                            </TabsList>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 pb-20">
                            <TabsContent value="group_rules" className="mt-0 space-y-4">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">基础提成规则</CardTitle>
                                        <CardDescription>适用于无渠道来源（如零售）或作为默认兜底规则</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <RuleEditor 
                                            rules={defaultRules} 
                                            onChange={setDefaultRules} 
                                            label="员工提成点数"
                                        />
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="channel_rules" className="mt-0 space-y-4">
                                {channels.map(c => (
                                    <Card key={c.id}>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-base font-bold">{c.name}</CardTitle>
                                            <CardDescription>配置该渠道下的固定提成比例</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="flex flex-col sm:flex-row gap-6">
                                                <div className="flex-1 space-y-2">
                                                    <Label className="text-sm text-muted-foreground">员工提成</Label>
                                                    <div className="flex items-center gap-2">
                                                        <Input 
                                                            type="number" 
                                                            min="0"
                                                            step="0.1"
                                                            value={channelRates[c.id]?.employee || ''}
                                                            onChange={e => setChannelRates(prev => ({
                                                                ...prev,
                                                                [c.id]: { ...prev[c.id], employee: e.target.value }
                                                            }))}
                                                            className="flex-1"
                                                        />
                                                        <span className="text-sm font-medium">%</span>
                                                    </div>
                                                </div>

                                                <div className="flex-1 space-y-2">
                                                    <Label className="text-sm text-muted-foreground">推广员提成</Label>
                                                    <div className="flex items-center gap-2">
                                                        <Input 
                                                            type="number" 
                                                            min="0"
                                                            step="0.1"
                                                            value={channelRates[c.id]?.promoter || ''}
                                                            onChange={e => setChannelRates(prev => ({
                                                                ...prev,
                                                                [c.id]: { ...prev[c.id], promoter: e.target.value }
                                                            }))}
                                                            className="flex-1"
                                                        />
                                                        <span className="text-sm font-medium">%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                                {channels.length === 0 && (
                                    <div className="text-center py-8 text-muted-foreground">
                                        暂无配置的渠道，请先在“渠道管理”中添加。
                                    </div>
                                )}
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button onClick={handleSave}>保存全部配置</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}