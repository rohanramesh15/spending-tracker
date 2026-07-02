import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCategories } from "@/api/hooks";

interface Props {
  value: string | null;
  onChange: (id: string) => void;
  /** Exclude system categories (Tax/Tip) — they're set at transaction level, not per item. */
  excludeSystem?: boolean;
  placeholder?: string;
}

export function CategorySelect({
  value,
  onChange,
  excludeSystem = true,
  placeholder = "Category",
}: Props) {
  const { data: categories = [] } = useCategories();
  const options = excludeSystem ? categories.filter((c) => !c.is_system) : categories;

  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger className="h-9">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
