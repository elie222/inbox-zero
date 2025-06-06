"use client";

import { useEffect, useState, useRef } from "react";
import { Zap, BookOpen } from "lucide-react";
import { cn } from "@/utils";

interface SlashCommandItem {
  name: string;
  icon: React.ReactNode;
  command: string;
  description: string;
  action: () => void;
}

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  onSelect: (item: SlashCommandItem) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

const DEFAULT_ITEMS: Omit<SlashCommandItem, 'action'>[] = [
  {
    name: "Rule",
    icon: <Zap className="h-4 w-4 text-green-600" />,
    command: "/rule",
    description: "Insert a new rule",
  },
  {
    name: "Context",
    icon: <BookOpen className="h-4 w-4 text-blue-600" />,
    command: "/context",
    description: "Insert context information",
  },
];

export function SlashCommandMenu({ 
  items, 
  onSelect, 
  onClose, 
  position 
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
          break;
        case "Enter":
          e.preventDefault();
          if (items[selectedIndex]) {
            onSelect(items[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [items, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  if (items.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="slash-command-menu"
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
      }}
    >
      {items.map((item, index) => (
        <button
          key={item.command}
          className={cn(
            "slash-command-item",
            selectedIndex === index && "active"
          )}
          onClick={() => onSelect(item)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          {item.icon}
          <div className="flex-1 text-left">
            <div className="font-medium">{item.name}</div>
            <div className="text-xs text-gray-500">{item.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}