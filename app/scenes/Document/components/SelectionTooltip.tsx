import { useEffect, useState } from "react";
import styled from "styled-components";
import { s } from "@shared/styles";

interface SelectionState {
  text: string;
  rect: DOMRect | null;
}

const initialState: SelectionState = {
  text: "",
  rect: null,
};

function SelectionTooltip() {
  const [selection, setSelection] = useState<SelectionState>(initialState);

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(initialState);
        return;
      }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const text = sel.toString();

      if (!text.trim() || rect.width === 0 || rect.height === 0) {
        setSelection(initialState);
        return;
      }

      setSelection({ text, rect });
    };

    document.addEventListener("mouseup", handleSelectionChange);
    document.addEventListener("keyup", handleSelectionChange);
    document.addEventListener("selectionchange", handleSelectionChange);

    return () => {
      document.removeEventListener("mouseup", handleSelectionChange);
      document.removeEventListener("keyup", handleSelectionChange);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, []);

  if (!selection.rect) {
    return null;
  }

  const { rect, text } = selection;
  const words = text
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0).length;
  const characters = text.length;

  const top = rect.top + window.scrollY - 32;
  const centerX = rect.left + rect.width / 2 + window.scrollX;

  return (
    <TooltipContainer
      style={{
        top,
        left: centerX,
      }}
    >
      <TooltipInner>
        {words} {words === 1 ? "word" : "words"} | {characters}{" "}
        {characters === 1 ? "character" : "characters"}
      </TooltipInner>
    </TooltipContainer>
  );
}

const TooltipContainer = styled.div`
  position: absolute;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 1000;
  opacity: 1;
  transition: opacity 120ms ease-in-out, transform 120ms ease-in-out;
`;

const TooltipInner = styled.div`
  background: ${s("menuBackground")};
  color: ${s("text")};
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  box-shadow: ${s("menuShadow")};
`;

export default SelectionTooltip;

