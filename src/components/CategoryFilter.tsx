interface Props {
  categories: string[]
  selected: string | null
  onSelect: (cat: string | null) => void
}

export default function CategoryFilter({ categories, selected, onSelect }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <button
        onClick={() => onSelect(null)}
        className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold ${
          !selected ? 'bg-primary text-white' : 'bg-white border-[1.5px] border-gray-200 text-gray-500'
        }`}
      >
        전체
      </button>
      {categories.map(cat => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs ${
            selected === cat ? 'bg-primary text-white font-semibold' : 'bg-white border-[1.5px] border-gray-200'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}
