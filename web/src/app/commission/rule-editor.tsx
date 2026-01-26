'use client';

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus } from "lucide-react";
import { CommissionRuleInput } from "./actions";

interface RuleEditorProps {
  rules: CommissionRuleInput[];
  onChange: (rules: CommissionRuleInput[]) => void;
  label?: string;
  ruleType?: string;
}

export function RuleEditor({ rules, onChange, label = "提成点数", ruleType }: RuleEditorProps) {
  useEffect(() => {
    if (rules.length === 0) {
      onChange([{ minCount: 0, maxCount: null, percentage: 0, ...(ruleType ? { type: ruleType } : {}) }]);
    } else if (rules[0].minCount !== 0) {
       const newRules = [...rules];
       newRules[0] = { ...newRules[0], minCount: 0 };
       onChange(newRules);
    }
  }, [rules.length]);

  const addRule = () => {
    const lastRule = rules[rules.length - 1];
    if (lastRule && lastRule.maxCount === null) {
        return; // Cannot add if last rule is infinite
    }
    
    const newMin = lastRule ? (lastRule.maxCount || 0) + 1 : 0;
    
    onChange([
      ...rules,
      { minCount: newMin, maxCount: null, percentage: 0, ...(ruleType ? { type: ruleType } : {}) }
    ]);
  };

  const updateRule = (index: number, field: keyof CommissionRuleInput, value: any) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], [field]: value };

    if (field === 'maxCount') {
       const maxVal = value;
       newRules[index].maxCount = maxVal;

       if (maxVal !== null) {
          if (index === newRules.length - 1) {
             newRules.push({
               minCount: (maxVal as number) + 1,
               maxCount: null,
               percentage: 0,
               ...(ruleType ? { type: ruleType } : {})
             });
          } else {
             if (newRules[index + 1]) {
                newRules[index + 1] = {
                   ...newRules[index + 1],
                   minCount: (maxVal as number) + 1
                };
             }
          }
       } else {
          if (index < newRules.length - 1) {
             newRules.splice(index + 1);
          }
       }
    } else if (field === 'minCount') {
       if (index === 0 && value !== 0) {
           newRules[index].minCount = 0;
       }
    }

    onChange(newRules);
  };

  const removeRule = (index: number) => {
    const newRules = rules.filter((_, i) => i !== index);
    if (newRules.length > 0 && index === 0) {
        newRules[0].minCount = 0;
    }
    onChange(newRules);
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium">阶梯规则配置<span className="text-red-500 ml-1">*</span></h4>
        <Button type="button" variant="outline" size="sm" onClick={addRule}>
          <Plus className="h-4 w-4 mr-1" /> 添加阶梯
        </Button>
      </div>
      
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">起始单量<span className="text-red-500 ml-1">*</span></TableHead>
              <TableHead className="w-[100px]">结束单量<span className="text-red-500 ml-1">*</span></TableHead>
              <TableHead>{label} (%)<span className="text-red-500 ml-1">*</span></TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Input 
                    type="number" 
                    value={rule.minCount} 
                    onChange={(e) => updateRule(index, 'minCount', parseInt(e.target.value) || 0)}
                    className="h-8"
                    required
                    disabled={index === 0}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center">
                    <Input 
                      type="number" 
                      value={rule.maxCount === null ? '' : rule.maxCount} 
                      placeholder="∞"
                      onChange={(e) => {
                        const val = e.target.value;
                        updateRule(index, 'maxCount', val === '' ? null : parseInt(val));
                      }}
                      className="h-8"
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <Input 
                    type="number" 
                    step="0.1"
                    value={rule.percentage} 
                    onChange={(e) => updateRule(index, 'percentage', parseFloat(e.target.value) || 0)}
                    className="h-8"
                    required
                  />
                </TableCell>
                <TableCell>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive"
                    onClick={() => removeRule(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rules.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-4">
                  暂无规则，请点击右上角添加
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">起始单量首行固定为0；最后一档结束单量留空代表无穷大。</p>
    </div>
  );
}
