import React, {
  useCallback, useMemo, useState
} from 'react';
import { CiceroMarkTransformer } from '@accordproject/markdown-cicero';
import { HtmlTransformer } from '@accordproject/markdown-html';
import { SlateTransformer } from '@accordproject/markdown-slate';
import isHotkey from 'is-hotkey';
import { Editable, withReact, Slate, ReactEditor } from 'slate-react';
import {
  Editor, Range, Node, createEditor, Transforms
} from 'slate';
import { withHistory } from 'slate-history';
import PropTypes from 'prop-types';
import HOTKEYS, { formattingHotKeys } from './utilities/hotkeys';
import { BUTTON_ACTIVE } from './utilities/constants';
import withSchema from './utilities/schema';
import Element from './components';
import Leaf from './components/Leaf';
import { toggleMark, toggleBlock } from './utilities/toolbarHelpers';
import { withImages, insertImage } from './plugins/withImages';
import { withLinks, isSelectionLinkBody } from './plugins/withLinks';
import { withHtml } from './plugins/withHtml';
import { withLists } from './plugins/withLists';
import FormatBar from './FormattingToolbar';

export const markdownToSlate = (markdown) => {
  const slateTransformer = new SlateTransformer();
  return slateTransformer.fromMarkdown(markdown);
};

export const MarkdownEditor = (props) => {
  const {
    canCopy,
    canKeyDown,
    augmentEditor,
    isEditable,
    canBeFormatted
  } = props;
  const [showLinkModal, setShowLinkModal] = useState(false);
  const editor = useMemo(() => {
    if (augmentEditor) {
      return augmentEditor(
        withLists(withLinks(withHtml(withImages(
          withSchema(withHistory(withReact(createEditor())))
        ))))
      );
    }
    return withLists(withLinks(withHtml(withImages(
      withSchema(withHistory(withReact(createEditor())))
    ))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderLeaf = useCallback(props => <Leaf {...props} />, []);
  const renderElement = useCallback((slateProps) => {
    const elementProps = { ...slateProps, customElements: props.customElements };
    return (<Element {...elementProps} />);
  }, [props.customElements]);

  const hotkeyActions = {
    mark: code => toggleMark(editor, code),
    block: code => toggleBlock(editor, code),
    image: () => {
      const url = window.prompt('Enter the URL of the image:');
      if (url) {
        insertImage(editor, url);
      }
    },
    special: (code) => {
      if (code === 'undo') return editor.undo();
      return editor.redo();
    },
    link: () => {
      setShowLinkModal(true);
    },
  };

  const onKeyDown = useCallback((event) => {
    if (!canKeyDown(editor, event)) {
      event.preventDefault();
      return;
    }
    const isFormatEvent = () => formattingHotKeys.some(hotkey => isHotkey(hotkey, event));
    if (!canBeFormatted(editor) && isFormatEvent()) {
      event.preventDefault();
      return;
    }

    const hotkeys = Object.keys(HOTKEYS);
    hotkeys.forEach((hotkey) => {
      if (isHotkey(hotkey, event)) {
        event.preventDefault();
        const { code, type } = HOTKEYS[hotkey];
        hotkeyActions[type](code);
      }
    });
  }, [canBeFormatted, canKeyDown, editor, hotkeyActions]);

  const onBeforeInput = useCallback((event) => {
    const canEdit = isEditable(editor, event);
    if (!canEdit) {
      event.preventDefault();
    }
  }, [editor, isEditable]);

  const handleCopyOrCut = useCallback((event, cut) => {
    event.preventDefault();
    if (!canCopy(editor)) return;
    const slateTransformer = new SlateTransformer();
    const htmlTransformer = new HtmlTransformer();
    const ciceroMarkTransformer = new CiceroMarkTransformer();
    const SLATE_CHILDREN = Node.fragment(editor, editor.selection);
    const SLATE_DOM = {
      object: 'value',
      document: {
        object: 'document',
        data: {},
        children: SLATE_CHILDREN
      }
    };
    const CICERO_MARK_DOM = slateTransformer.toCiceroMark(SLATE_DOM);
    const HTML_DOM = htmlTransformer.toHtml(CICERO_MARK_DOM);
    const MARKDOWN_TEXT = ciceroMarkTransformer.toMarkdown(CICERO_MARK_DOM);

    event.clipboardData.setData('text/html', HTML_DOM);
    event.clipboardData.setData('text/plain', MARKDOWN_TEXT);

    if (cut && editor.selection && Range.isExpanded(editor.selection)) {
      Editor.deleteFragment(editor);
    }
  }, [canCopy, editor]);

  const onChange = (value) => {
    if (props.readOnly) return;
    props.onChange(value, editor);
    const { selection } = editor;
    if (selection && isSelectionLinkBody(editor)) {
      setShowLinkModal(true);
    }
  };

  const onDragStart = event => {
    console.log('onDragStart', event.target);

    const node = ReactEditor.toSlateNode(editor, event.target);
    const path = ReactEditor.findPath(editor, node);
    const range = Editor.range(editor, path);

    const fragment = Node.fragment(editor, range);
    const string = JSON.stringify(fragment);
    const encoded = window.btoa(encodeURIComponent(string));
    // event.dataTransfer.setData('application/x-slate-fragment', encoded);
    console.log('start range ---- ', range);
    console.log('start fragment ---- ', fragment);
    console.log('path ---- ', path);

    // editor.deleteFragment(fragment);
    // Transforms.removeNodes(editor, { at: range });
    event.dataTransfer.setData('text', JSON.stringify(range));
  };

  const onDragOver = event => {
    console.log('onDragOver');

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const onDrop = event => {
    // const fragment = event.dataTransfer.getData('application/x-slate-fragment');
    // const sourcePath = JSON.parse(event.dataTransfer.getData('text'));
    const sourceRange = JSON.parse(event.dataTransfer.getData('text'));
    // console.log('sourceRange', JSON.stringify(sourceRange, null, 2));
    // Transforms.removeNodes(editor, { at: sourceRange });


    const range = ReactEditor.findEventRange(editor, event);

    // console.log('node - ', ReactEditor.toSlateNode(editor, event.target));

    console.log('range - ', sourceRange);
    Transforms.select(editor, sourceRange);
    console.log('selection - ', editor.selection);

    const node = Node.parent(editor, editor.selection.anchor.path);
    console.log('node - ', node);
    const [clauseNode] = Editor.nodes(editor, { match: n => n.type === 'clause', at: sourceRange });
    console.log('clauseNode', clauseNode);


    // const node = Node.get(editor, sourcePath);

    Transforms.select(editor, range);
    Transforms.splitNodes(editor);
    console.log('selection ---', editor.selection);
    // Transforms.moveNodes(editor, { at: sourceRange.anchor.path, match: n => n.type === 'clause', to: [editor.selection.focus.path] });
    Transforms.removeNodes(editor, { at: sourceRange.anchor.path, match: n => n.type === 'clause' });
    Transforms.insertNodes(editor, clauseNode);


    // Transforms.insertNodes(editor, node);

    // Transforms.moveNodes(editor, {
    //   at: sourcePath,
    //   to: editor.selection.path
    // });

    // Transforms.removeNodes(editor);
    // Transforms.select(editor, range);
    // Transforms.splitNodes(editor);
    // ReactEditor.insertData(editor, event.dataTransfer);

    // Transforms.select(editor, range);
    // const decoded = decodeURIComponent(window.atob(fragment));
    // const parsed = JSON.parse(decoded);
    // console.log('fragment', parsed);

    // Transforms.insertFragment(editor, parsed);
    // ReactEditor.insertData(editor, event.dataTransfer);

    // const node = ReactEditor.toSlateNode(editor, event.target);
    // const path = ReactEditor.findPath(editor, node);
    // console.log('destination path --- ', path);
    // Transforms.moveNodes(editor, {
    //   at: [Number(sourcePath)],
    //   to: path
    // });
    // console.log('on drop node - ', node);
    // const range = Editor.range(editor, path);

    // const fragment = Node.fragment(editor, range);
    // editor.deleteFragment(fragment);
  };

  return (
    <Slate editor={editor} value={props.value} onChange={onChange}>
      { !props.readOnly
        && <FormatBar
        canBeFormatted={props.canBeFormatted}
        showLinkModal={showLinkModal}
        setShowLinkModal={setShowLinkModal}
        activeButton={props.activeButton || BUTTON_ACTIVE}
        /> }
      <Editable
        id="ap-rich-text-editor"
        readOnly={props.readOnly}
        renderElement={renderElement}
        renderLeaf={renderLeaf}
        placeholder={props.placeholder || 'Enter some rich text...'}
        spellCheck
        autoFocus
        onKeyDown={onKeyDown}
        onDOMBeforeInput={onBeforeInput}
        onCopy={handleCopyOrCut}
        onCut={event => handleCopyOrCut(event, true)}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
      />
    </Slate>
  );
};

/**
 * The property types for this component
 */
MarkdownEditor.propTypes = {
  /* Initial contents for the editor (markdown text) */
  value: PropTypes.array.isRequired,
  /* A callback that receives the markdown text */
  onChange: PropTypes.func.isRequired,
  /* Boolean to make editor read-only (uneditable) or not (editable) */
  readOnly: PropTypes.bool,
  /* Higher order function to augment the editor methods */
  augmentEditor: PropTypes.func,
  /* Function for extending elements rendered by editor */
  customElements: PropTypes.func,
  /* A method that determines if current edit should be allowed */
  isEditable: PropTypes.func,
  /* A method that determines if current formatting change should be allowed */
  canBeFormatted: PropTypes.func,
  /* A method that determines if current selection copy should be allowed */
  canCopy: PropTypes.func,
  /* A method that determines if current key event should be allowed */
  canKeyDown: PropTypes.func,
  /* Placeholder text when the editor is blank */
  placeholder: PropTypes.string,
  /* Optional object to change formatting button active state color */
  activeButton: PropTypes.object,
};

MarkdownEditor.defaultProps = {
  isEditable: () => true,
  canBeFormatted: () => true,
  canCopy: () => true,
  canKeyDown: () => true,
};
