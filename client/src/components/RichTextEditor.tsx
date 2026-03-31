import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import UnderlineExtension from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useCallback } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link,
  Undo2,
  Redo2,
  Heading1,
  Heading2,
  Heading3,
  Palette,
} from "lucide-react";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}

const toolbarButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  border: "1px solid transparent",
  borderRadius: 4,
  background: "transparent",
  cursor: "pointer",
  padding: 0,
  color: "#555",
};

const activeButtonStyle: React.CSSProperties = {
  ...toolbarButtonStyle,
  background: "#e9ecef",
  color: "#000",
  borderColor: "#ced4da",
};

const separatorStyle: React.CSSProperties = {
  width: 1,
  height: 24,
  background: "#dee2e6",
  margin: "0 4px",
  alignSelf: "center" as const,
};

export default function RichTextEditor({
  content,
  onChange,
  placeholder = "",
  minHeight = "200px",
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      UnderlineExtension,
      TextStyle,
      Color,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL do link:", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const setColor = useCallback(() => {
    if (!editor) return;
    const color = window.prompt("Cor do texto (hex):", "#000000");
    if (color === null) return;
    editor.chain().focus().setColor(color).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      data-testid="rich-text-editor"
      className="tiptap-editor"
      style={{
        border: "1px solid #dee2e6",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <style>{`
        .tiptap-editor .ProseMirror { min-height: ${minHeight}; outline: none; padding: 12px; }
        .tiptap-editor .ProseMirror p.is-editor-empty:first-child::before { color: #adb5bd; content: attr(data-placeholder); float: left; height: 0; pointer-events: none; }
      `}</style>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 2,
          padding: "6px 8px",
          borderBottom: "1px solid #dee2e6",
          background: "#f8f9fa",
        }}
      >
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          style={editor.isActive("bold") ? activeButtonStyle : toolbarButtonStyle}
          title="Negrito"
          data-testid="button-bold"
        >
          <Bold size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          style={editor.isActive("italic") ? activeButtonStyle : toolbarButtonStyle}
          title="Itálico"
          data-testid="button-italic"
        >
          <Italic size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          style={editor.isActive("underline") ? activeButtonStyle : toolbarButtonStyle}
          title="Sublinhado"
          data-testid="button-underline"
        >
          <Underline size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          style={editor.isActive("strike") ? activeButtonStyle : toolbarButtonStyle}
          title="Tachado"
          data-testid="button-strikethrough"
        >
          <Strikethrough size={16} />
        </button>
        <button
          type="button"
          onClick={setColor}
          style={toolbarButtonStyle}
          title="Cor do texto"
          data-testid="button-color"
        >
          <Palette size={16} />
        </button>

        <div style={separatorStyle} />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          style={editor.isActive("heading", { level: 1 }) ? activeButtonStyle : toolbarButtonStyle}
          title="Título 1"
          data-testid="button-h1"
        >
          <Heading1 size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          style={editor.isActive("heading", { level: 2 }) ? activeButtonStyle : toolbarButtonStyle}
          title="Título 2"
          data-testid="button-h2"
        >
          <Heading2 size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          style={editor.isActive("heading", { level: 3 }) ? activeButtonStyle : toolbarButtonStyle}
          title="Título 3"
          data-testid="button-h3"
        >
          <Heading3 size={16} />
        </button>

        <div style={separatorStyle} />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          style={editor.isActive("bulletList") ? activeButtonStyle : toolbarButtonStyle}
          title="Lista com marcadores"
          data-testid="button-bullet-list"
        >
          <List size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          style={editor.isActive("orderedList") ? activeButtonStyle : toolbarButtonStyle}
          title="Lista numerada"
          data-testid="button-ordered-list"
        >
          <ListOrdered size={16} />
        </button>

        <div style={separatorStyle} />

        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          style={editor.isActive({ textAlign: "left" }) ? activeButtonStyle : toolbarButtonStyle}
          title="Alinhar à esquerda"
          data-testid="button-align-left"
        >
          <AlignLeft size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          style={editor.isActive({ textAlign: "center" }) ? activeButtonStyle : toolbarButtonStyle}
          title="Centralizar"
          data-testid="button-align-center"
        >
          <AlignCenter size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          style={editor.isActive({ textAlign: "right" }) ? activeButtonStyle : toolbarButtonStyle}
          title="Alinhar à direita"
          data-testid="button-align-right"
        >
          <AlignRight size={16} />
        </button>

        <div style={separatorStyle} />

        <button
          type="button"
          onClick={setLink}
          style={editor.isActive("link") ? activeButtonStyle : toolbarButtonStyle}
          title="Inserir link"
          data-testid="button-link"
        >
          <Link size={16} />
        </button>

        <div style={separatorStyle} />

        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          style={{
            ...toolbarButtonStyle,
            opacity: editor.can().undo() ? 1 : 0.3,
            cursor: editor.can().undo() ? "pointer" : "default",
          }}
          title="Desfazer"
          data-testid="button-undo"
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          style={{
            ...toolbarButtonStyle,
            opacity: editor.can().redo() ? 1 : 0.3,
            cursor: editor.can().redo() ? "pointer" : "default",
          }}
          title="Refazer"
          data-testid="button-redo"
        >
          <Redo2 size={16} />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
