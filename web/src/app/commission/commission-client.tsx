'use client';

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, Users, Check, MoreHorizontal } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface CommissionClientProps {
  initialAccountGroups: any[];
  initialChannelConfigs: any[];
  users: any[];
}

const POLICY_TYPES = [
  { value: "QUANTITY", label: "单量梯度" },
  { value: "GMV", label: "GMV梯度" }
];

const normalizePolicyType = (type?: string) => type || "QUANTITY";

const getRulesByType = (rules: any[], type: string) =>
  (rules || []).filter(r => normalizePolicyType(r.type) === type);

const mergeRulesByType = (allRules: any[], type: string, newRules: any[]) => {
  const remaining = (allRules || []).filter(r => normalizePolicyType(r.type) !== type);
  const typedNewRules = (newRules || []).map(r => ({ ...r, type }));
  return [...remaining, ...typedNewRules];
};

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

  // Policy/Rule Editor
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<{
    ownerId: string;
    ownerType: 'group' | 'channel';
    rules: CommissionRuleInput[];
    title: string;
    policyType: string;
    allowTypeSelect: boolean;
    policyTypeOptions: string[];
  } | null>(null);

  // Channel Basic Info
  const [isChannelBasicOpen, setIsChannelBasicOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<{ id?: string, name: string, settlementByCompleted: boolean } | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type?: 'group' | 'channel' | 'policy';
    ownerId?: string;
    ownerType?: 'group' | 'channel';
    policyType?: string;
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

  // 3. Policy Editor
  const getPolicyTitle = (ownerType: 'group' | 'channel', policyType: string) => {
    const label = POLICY_TYPES.find(p => p.value === policyType)?.label || policyType;
    return `${label}提成政策`;
  };

  const handleEditPolicy = (
    ownerId: string,
    ownerType: 'group' | 'channel',
    rules: any[],
    policyType: string
  ) => {
    const normalizedType = normalizePolicyType(policyType);
    setEditingPolicy({
      ownerId,
      ownerType,
      rules: getRulesByType(rules, normalizedType).map(r => ({ ...r, type: normalizedType })),
      title: getPolicyTitle(ownerType, normalizedType),
      policyType: normalizedType,
      allowTypeSelect: false,
      policyTypeOptions: POLICY_TYPES.map(p => p.value)
    });
    setIsPolicyOpen(true);
  };

  const handleAddPolicy = (ownerId: string, ownerType: 'group' | 'channel') => {
    const currentRules =
      ownerType === 'group'
        ? accountGroups.find(g => g.id === ownerId)?.rules || []
        : channelConfigs.find(c => c.id === ownerId)?.rules || [];
    const existingTypes = new Set((currentRules || []).map((r: any) => normalizePolicyType(r.type)));
    const options = POLICY_TYPES.map(p => p.value).filter(v => !existingTypes.has(v));
    if (options.length === 0) {
      toast.error("已存在所有政策类型，不能重复添加");
      return;
    }
    const defaultType = options[0];
    setEditingPolicy({
      ownerId,
      ownerType,
      rules: [],
      title: getPolicyTitle(ownerType, defaultType),
      policyType: defaultType,
      allowTypeSelect: true,
      policyTypeOptions: options
    });
    setIsPolicyOpen(true);
  };

  const validatePolicyRules = (rules: CommissionRuleInput[]) => {
    if (!rules || rules.length === 0) {
      toast.error("请至少添加1条规则");
      return false;
    }
    for (const rule of rules) {
      if (rule.minCount === null || Number.isNaN(rule.minCount)) {
        toast.error("起始单量为必填");
        return false;
      }
      // Allow maxCount to be null (infinity)
      if (rule.maxCount !== null && !Number.isNaN(rule.maxCount)) {
        if (rule.maxCount < rule.minCount) {
          toast.error("结束单量不能小于起始单量");
          return false;
        }
      }
      if (rule.percentage === null || Number.isNaN(rule.percentage) || rule.percentage <= 0) {
        toast.error("提成点数必须大于0");
        return false;
      }
    }
    return true;
  };

  const handleSavePolicy = async () => {
    if (!editingPolicy) return;
    let res;
    const policyType = normalizePolicyType(editingPolicy.policyType);
    if (editingPolicy.ownerType === 'group') {
      const group = accountGroups.find(g => g.id === editingPolicy.ownerId);
      if (!group) return toast.error("未找到账号组");
      const existingTypes = new Set((group.rules || []).map((r: any) => normalizePolicyType(r.type)));
      if (editingPolicy.allowTypeSelect && existingTypes.has(policyType)) {
        toast.error("已存在该政策类型，不能重复添加");
        return;
      }
      if (!validatePolicyRules(editingPolicy.rules)) return;
      const mergedRules = mergeRulesByType(group.rules || [], policyType, editingPolicy.rules);
      res = await upsertAccountGroup({
        id: editingPolicy.ownerId,
        name: group.name,
        rules: mergedRules
      });
    } else {
      const channel = channelConfigs.find(c => c.id === editingPolicy.ownerId);
      if (!channel) return toast.error("未找到渠道");
      const existingTypes = new Set((channel.rules || []).map((r: any) => normalizePolicyType(r.type)));
      if (editingPolicy.allowTypeSelect && existingTypes.has(policyType)) {
        toast.error("已存在该政策类型，不能重复添加");
        return;
      }
      if (!validatePolicyRules(editingPolicy.rules)) return;
      const mergedRules = mergeRulesByType(channel.rules || [], policyType, editingPolicy.rules);
      res = await upsertChannelConfig({
        id: editingPolicy.ownerId,
        name: channel.name,
        rules: mergedRules
      });
    }

    if (res.success) {
      toast.success("政策已更新");
      setIsPolicyOpen(false);
      router.refresh();
    } else {
      toast.error("保存失败: " + res.error);
    }
  };

  // 4. Channel Basic
  const handleEditChannelBasic = (channel?: any) => {
    if (channel) {
      setEditingChannel({ id: channel.id, name: channel.name, settlementByCompleted: channel.settlementByCompleted ?? true });
    } else {
      setEditingChannel({ name: '', settlementByCompleted: true });
    }
    setIsChannelBasicOpen(true);
  };

  const handleSaveChannelBasic = async () => {
    if (!editingChannel?.name) return toast.error("请输入名称");
    const res = await upsertChannelConfig({
      id: editingChannel.id,
      name: editingChannel.name,
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

  const getConfirmMessage = () => {
    if (confirmDialog.type === "group") return "确认删除该账号组？";
    if (confirmDialog.type === "channel") return "确认删除该渠道？";
    if (confirmDialog.type === "policy") {
      return confirmDialog.ownerType === "group" ? "确认删除该账号组政策？" : "确认删除该渠道政策？";
    }
    return "确认执行删除？";
  };

  const openDeleteGroup = (id: string) => {
    setConfirmDialog({ open: true, type: 'group', ownerId: id });
  };

  const openDeleteChannel = (id: string) => {
    setConfirmDialog({ open: true, type: 'channel', ownerId: id });
  };

  const openDeletePolicy = (ownerType: 'group' | 'channel', ownerId: string, policyType: string) => {
    setConfirmDialog({ open: true, type: 'policy', ownerType, ownerId, policyType });
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
    if (confirmDialog.type === 'policy' && confirmDialog.ownerId && confirmDialog.ownerType && confirmDialog.policyType) {
      const policyType = normalizePolicyType(confirmDialog.policyType);
      if (confirmDialog.ownerType === 'group') {
        const group = accountGroups.find(g => g.id === confirmDialog.ownerId);
        if (!group) {
          toast.error("未找到账号组");
          return;
        }
        const mergedRules = mergeRulesByType(group.rules || [], policyType, []);
        const res = await upsertAccountGroup({
          id: confirmDialog.ownerId,
          name: group.name,
          rules: mergedRules
        });
        if (res.success) {
          setConfirmDialog({ open: false });
          router.refresh();
        } else {
          toast.error(res.error);
        }
      } else {
        const channel = channelConfigs.find(c => c.id === confirmDialog.ownerId);
        if (!channel) {
          toast.error("未找到渠道");
          return;
        }
        const mergedRules = mergeRulesByType(channel.rules || [], policyType, []);
        const res = await upsertChannelConfig({
          id: confirmDialog.ownerId,
          name: channel.name,
          rules: mergedRules
        });
        if (res.success) {
          setConfirmDialog({ open: false });
          router.refresh();
        } else {
          toast.error(res.error);
        }
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

                  {/* Policies */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">提成政策</h4>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleAddPolicy(group.id, 'group')}>
                        添加政策
                      </Button>
                    </div>
                    {Array.from(new Set((group.rules || []).map((r: any) => normalizePolicyType(r.type)))).map((policyType: string) => {
                      const rules = getRulesByType(group.rules, policyType);
                      const label = POLICY_TYPES.find(p => p.value === policyType)?.label || policyType;
                      return (
                        <div
                          key={policyType}
                          className="border rounded-md p-3 hover:bg-slate-50 cursor-pointer transition-colors group/policy"
                          onClick={() => handleEditPolicy(group.id, 'group', group.rules, policyType)}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">{label}</Badge>
                              <span className="font-medium text-sm">{label}政策</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDeletePolicy('group', group.id, policyType);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                              <Edit className="h-3 w-3 text-muted-foreground opacity-0 group-hover/policy:opacity-100 transition-opacity" />
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {rules.length > 0 ? (
                              rules.map((r: any, i: number) => (
                                <div key={i}>{r.maxCount ? `${r.minCount}-${r.maxCount}` : `>${r.minCount}`}单: {r.percentage}%</div>
                              ))
                            ) : "点击配置规则..."}
                          </div>
                        </div>
                      );
                    })}
                    {(!group.rules || group.rules.length === 0) && (
                      <div className="text-xs text-muted-foreground">暂无政策</div>
                    )}
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

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {channelConfigs.map((channel: any) => (
              <Card key={channel.id} className="flex flex-col">
                 <CardHeader className="pb-2">
                  <div className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg font-bold">{channel.name}</CardTitle>
                    <div className="flex space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEditChannelBasic(channel)} className="h-8 w-8">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => openDeleteChannel(channel.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 flex-1">
                   {/* Associated Personnel (Promoters Count) */}
                   <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">关联人员</h4>
                    <div className="flex items-center gap-2 flex-wrap">
                      {channel.promoters && channel.promoters.length > 0 ? (
                        <>
                          <div className="flex -space-x-2 overflow-hidden">
                            {channel.promoters.slice(0, 5).map((p: any) => (
                              <TooltipProvider key={p.id}>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Avatar className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-slate-200">
                                      <AvatarFallback className="text-xs">{p.name?.[0]}</AvatarFallback>
                                    </Avatar>
                                  </TooltipTrigger>
                                  <TooltipContent><p>{p.name}</p></TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ))}
                          </div>
                          {channel.promoters.length > 5 && (
                            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted text-xs font-medium ring-2 ring-white">
                              +{channel.promoters.length - 5}
                            </div>
                          )}
                          <span className="text-xs text-muted-foreground ml-1">共 {channel.promoters.length} 人</span>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground italic">暂无关联</span>
                      )}
                    </div>
                  </div>

                  {/* Policies */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">成本政策</h4>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleAddPolicy(channel.id, 'channel')}>
                        添加政策
                      </Button>
                    </div>
                    {(["QUANTITY", ...Array.from(new Set(channel.rules.map((r: any) => normalizePolicyType(r.type))))].filter(
                      (v, i, arr) => arr.indexOf(v) === i
                    )).map((policyType: string) => {
                      const rules = getRulesByType(channel.rules, policyType);
                      const label = POLICY_TYPES.find(p => p.value === policyType)?.label || policyType;
                      return (
                        <div
                          key={policyType}
                          className="border rounded-md p-3 hover:bg-slate-50 cursor-pointer transition-colors group/policy"
                          onClick={() => handleEditPolicy(channel.id, 'channel', channel.rules, policyType)}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{label}</Badge>
                              <span className="font-medium text-sm">{label}政策</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDeletePolicy('channel', channel.id, policyType);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                              <Edit className="h-3 w-3 text-muted-foreground opacity-0 group-hover/policy:opacity-100 transition-opacity" />
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {rules.length > 0 ? (
                              rules.map((r: any, i: number) => (
                                <div key={i}>{r.maxCount ? `${r.minCount}-${r.maxCount}` : `>${r.minCount}`}单: {r.percentage}%</div>
                              ))
                            ) : "点击配置规则..."}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
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
            <div className="flex items-center space-x-2">
              <Checkbox
                id="group-settlement-by-completed"
                checked={!!editingGroup?.settlementByCompleted}
                onCheckedChange={(checked) => {
                  setEditingGroup(prev => prev ? { ...prev, settlementByCompleted: checked === true } : null)
                }}
              />
              <label htmlFor="group-settlement-by-completed" className="text-sm cursor-pointer select-none">
                按已完成订单结算
              </label>
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
                按已完成订单结算
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

      {/* 4. Policy/Rule Dialog */}
      <Dialog open={isPolicyOpen} onOpenChange={setIsPolicyOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingPolicy?.title}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {editingPolicy && (
              <>
                <div className="space-y-2">
                  <Label>政策类型<span className="text-red-500 ml-1">*</span></Label>
                  <Select
                    value={editingPolicy.policyType}
                    onValueChange={(val) => {
                      if (!editingPolicy.allowTypeSelect) return;
                      setEditingPolicy({
                        ...editingPolicy,
                        policyType: val,
                        title: getPolicyTitle(editingPolicy.ownerType, val),
                        rules: []
                      });
                    }}
                  >
                    <SelectTrigger disabled={!editingPolicy.allowTypeSelect}>
                      <SelectValue placeholder="选择政策类型" />
                    </SelectTrigger>
                    <SelectContent>
                      {(editingPolicy.allowTypeSelect ? editingPolicy.policyTypeOptions : POLICY_TYPES.map(p => p.value)).map(type => (
                        <SelectItem key={type} value={type}>
                          {POLICY_TYPES.find(p => p.value === type)?.label || type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <RuleEditor 
                  rules={editingPolicy.rules} 
                  onChange={rules => setEditingPolicy({
                    ...editingPolicy,
                    rules: rules.map(r => ({ ...r, type: editingPolicy.policyType }))
                  })}
                  label={editingPolicy.ownerType === 'group' ? "提成点数" : "成本点数"}
                  ruleType={editingPolicy.policyType}
                />
              </>
            )}
            <Button onClick={handleSavePolicy} className="w-full mt-4">保存配置</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>确认删除</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground">{getConfirmMessage()}</div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setConfirmDialog({ open: false })}>取消</Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
