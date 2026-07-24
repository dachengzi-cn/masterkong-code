import { useState, useEffect, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import MultiSelect from '@/components/ui/multi-select';
import { getDatasets, getSpecOptions } from '@client/src/api/dataset';
import { toast } from 'sonner';

interface CustomCombo {
  id: string;
  name: string;
  items: string[];
  type: 'brand' | 'spec';
  createdAt: string;
}

const STORAGE_KEY = 'quick_custom_combos';

function loadCombos(): CustomCombo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCombos(combos: CustomCombo[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(combos));
}

const QuickCustom = () => {
  const [combos, setCombos] = useState<CustomCombo[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [specOptions, setSpecOptions] = useState<string[]>([]);

  // Brand custom state
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [brandName, setBrandName] = useState('');

  // Spec custom state
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>([]);
  const [specName, setSpecName] = useState('');

  useEffect(() => {
    setCombos(loadCombos());
    // 从最新的生产力数据集中提取品牌和规格选项
    getDatasets({ page: 1, pageSize: 1 })
      .then((data) => {
        if (data.items && data.items.length > 0) {
          const latestDataset = data.items[0];
          return getSpecOptions(latestDataset.id);
        }
        return null;
      })
      .then((specData) => {
        if (specData) {
          setBrandOptions(specData.brands || []);
          setSpecOptions(specData.specifications || []);
        }
      })
      .catch(() => {});
  }, []);

  const handleCreateBrand = useCallback(() => {
    if (!brandName.trim()) {
      toast.error('请输入自定义品牌组合名称');
      return;
    }
    if (selectedBrands.length === 0) {
      toast.error('请至少选择一个品牌');
      return;
    }
    const newCombo: CustomCombo = {
      id: Date.now().toString(),
      name: brandName.trim(),
      items: [...selectedBrands],
      type: 'brand',
      createdAt: new Date().toLocaleString('zh-CN'),
    };
    const updated = [newCombo, ...combos];
    setCombos(updated);
    saveCombos(updated);
    setBrandName('');
    setSelectedBrands([]);
    toast.success(`品牌组合「${brandName.trim()}」已创建`);
  }, [brandName, selectedBrands, combos]);

  const handleCreateSpec = useCallback(() => {
    if (!specName.trim()) {
      toast.error('请输入自定义规格组合名称');
      return;
    }
    if (selectedSpecs.length === 0) {
      toast.error('请至少选择一个规格');
      return;
    }
    const newCombo: CustomCombo = {
      id: Date.now().toString(),
      name: specName.trim(),
      items: [...selectedSpecs],
      type: 'spec',
      createdAt: new Date().toLocaleString('zh-CN'),
    };
    const updated = [newCombo, ...combos];
    setCombos(updated);
    saveCombos(updated);
    setSpecName('');
    setSelectedSpecs([]);
    toast.success(`规格组合「${specName.trim()}」已创建`);
  }, [specName, selectedSpecs, combos]);

  const handleDelete = useCallback((id: string) => {
    const updated = combos.filter((c) => c.id !== id);
    setCombos(updated);
    saveCombos(updated);
    toast.success('已删除');
  }, [combos]);

  const brandCombos = combos.filter((c) => c.type === 'brand');
  const specCombos = combos.filter((c) => c.type === 'spec');

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">快捷自定义</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 品牌自定义 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center text-base leading-none text-primary" >🏷️</span>
            <span className="text-sm font-medium text-foreground">品牌自定义</span>
          </div>

          <div className="space-y-2">
            <MultiSelect
              label="选择品牌"
              options={brandOptions}
              value={selectedBrands}
              onChange={setSelectedBrands}
            />

            <div className="flex gap-2">
              <Input
                placeholder="自定义组合名称"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="h-8 text-xs"
              />
              <Button size="sm" onClick={handleCreateBrand} className="h-8 text-xs">
                <span className="inline-flex items-center justify-center text-base leading-none mr-1" >➕</span>
                创建
              </Button>
            </div>
          </div>

          {brandCombos.length > 0 && (
            <div className="space-y-1.5 mt-3">
              {brandCombos.map((combo) => (
                <div
                  key={combo.id}
                  className="flex items-center justify-between rounded-sm border border-border bg-accent/30 px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground truncate">
                        {combo.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {combo.createdAt}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {combo.items.map((item) => (
                        <Badge
                          key={item}
                          variant="secondary"
                          className="px-1.5 py-0 text-[10px] font-normal"
                        >
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive ml-2"
                    onClick={() => handleDelete(combo.id)}
                  >
                    <span className="inline-flex items-center justify-center text-base leading-none" >🗑️</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 规格自定义 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center text-base leading-none text-primary" >📦</span>
            <span className="text-sm font-medium text-foreground">规格自定义</span>
          </div>

          <div className="space-y-2">
            <MultiSelect
              label="选择规格"
              options={specOptions}
              value={selectedSpecs}
              onChange={setSelectedSpecs}
            />

            <div className="flex gap-2">
              <Input
                placeholder="自定义组合名称"
                value={specName}
                onChange={(e) => setSpecName(e.target.value)}
                className="h-8 text-xs"
              />
              <Button size="sm" onClick={handleCreateSpec} className="h-8 text-xs">
                <span className="inline-flex items-center justify-center text-base leading-none mr-1" >➕</span>
                创建
              </Button>
            </div>
          </div>

          {specCombos.length > 0 && (
            <div className="space-y-1.5 mt-3">
              {specCombos.map((combo) => (
                <div
                  key={combo.id}
                  className="flex items-center justify-between rounded-sm border border-border bg-accent/30 px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground truncate">
                        {combo.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {combo.createdAt}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {combo.items.map((item) => (
                        <Badge
                          key={item}
                          variant="secondary"
                          className="px-1.5 py-0 text-[10px] font-normal"
                        >
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive ml-2"
                    onClick={() => handleDelete(combo.id)}
                  >
                    <span className="inline-flex items-center justify-center text-base leading-none" >🗑️</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickCustom;
