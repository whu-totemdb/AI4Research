import { useState } from 'react';
import { Modal, Upload, Input, Switch, TreeSelect, message, notification } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { uploadPaper, uploadMarkdown, setPaperFolders, convertPdfToMd, getPaper } from '../api';
import type { Folder } from '../types';

interface UploadModalProps {
  open: boolean;
  folders: Folder[];
  onClose: () => void;
  onSuccess: () => void;
}

function buildTreeSelectData(folders: Folder[], parentId: number | null = null): any[] {
  return folders
    .filter((f) => f.parent_id === parentId)
    .map((f) => ({
      title: f.name,
      value: f.id,
      key: f.id,
      children: buildTreeSelectData(folders, f.id),
    }));
}

export default function UploadModal({ open, folders, onClose, onSuccess }: UploadModalProps) {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [mdFileList, setMdFileList] = useState<UploadFile[]>([]);
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [venue, setVenue] = useState('');
  const [publishDate, setPublishDate] = useState('');
  const [briefNote, setBriefNote] = useState('');
  const [tags, setTags] = useState('');
  const [folderIds, setFolderIds] = useState<number[]>([]);
  const [autoConvert, setAutoConvert] = useState(true);
  const [autoExtract, setAutoExtract] = useState(true);
  const [uploading, setUploading] = useState(false);

  const resetForm = () => {
    setFileList([]);
    setMdFileList([]);
    setTitle('');
    setAuthors('');
    setVenue('');
    setPublishDate('');
    setBriefNote('');
    setTags('');
    setFolderIds([]);
    setAutoConvert(true);
    setAutoExtract(true);
  };

  const handleUpload = async () => {
    if (fileList.length === 0) {
      message.warning('请选择PDF文件');
      return;
    }
    const file = fileList[0] as unknown as { originFileObj?: File };
    const raw = file.originFileObj;
    if (!raw) {
      message.error('文件无效');
      return;
    }

    const formData = new FormData();
    formData.append('file', raw);
    formData.append('title', title || raw.name.replace('.pdf', ''));
    formData.append('authors', authors);
    formData.append('tags', tags);
    if (venue) formData.append('venue', venue);
    if (publishDate) formData.append('publish_date', publishDate);
    if (briefNote) formData.append('brief_note', briefNote);

    setUploading(true);
    try {
      const res = await uploadPaper(formData);
      const newPaper = res.data as { id: number };

      // Set folders if selected
      if (folderIds.length > 0) {
        try {
          await setPaperFolders(newPaper.id, folderIds);
        } catch {
          message.warning('论文已上传，但分类设置失败');
        }
      }

      // Auto extract metadata
      if (autoExtract && !autoConvert) {
        // No MD conversion, but need to extract metadata — need MD first
        notification.warning({
          message: '元信息提取',
          description: '需要先转换MD才能提取元信息，请开启自动转换MD',
          placement: 'bottomRight',
        });
      }

      // Auto convert MD via MinerU
      if (autoConvert) {
        try {
          await convertPdfToMd(newPaper.id, autoExtract);
          notification.info({
            key: `convert-${newPaper.id}`,
            message: 'MD转换已开始',
            description: autoExtract
              ? '正在转换MD，完成后将自动提取元信息，请稍候...'
              : '正在转换MD，请稍候...',
            placement: 'bottomRight',
            duration: 0,
          });
          // Poll for completion
          const pollId = newPaper.id;
          const poll = setInterval(async () => {
            try {
              const res = await getPaper(pollId);
              const p = res.data;
              if (!p.has_markdown) return; // still converting

              if (!autoExtract) {
                // Only MD conversion, done
                clearInterval(poll);
                notification.success({
                  key: `convert-${pollId}`,
                  message: 'MD转换完成',
                  description: '论文已成功转换为Markdown',
                  placement: 'bottomRight',
                  duration: 5,
                });
                onSuccess?.();
                return;
              }

              // MD done, check if metadata also done
              if (p.venue || p.publish_date) {
                // Both done
                clearInterval(poll);
                notification.success({
                  key: `convert-${pollId}`,
                  message: '处理完成',
                  description: 'MD转换和元信息提取已完成',
                  placement: 'bottomRight',
                  duration: 5,
                });
                onSuccess?.();
              } else {
                // MD done, metadata still extracting — update notification once
                notification.info({
                  key: `convert-${pollId}`,
                  message: 'MD转换完成',
                  description: '正在提取元信息...',
                  placement: 'bottomRight',
                  duration: 0,
                });
              }
            } catch { /* ignore */ }
          }, 5000);
          // Timeout after 5 minutes
          setTimeout(() => clearInterval(poll), 300000);
        } catch {
          notification.error({
            message: 'MD转换启动失败',
            description: '论文已上传，但MD转换未能启动',
            placement: 'bottomRight',
          });
        }
      }

      // Manual MD upload
      if (!autoConvert && mdFileList.length > 0) {
        const mdFile = mdFileList[0] as unknown as { originFileObj?: File };
        const mdRaw = mdFile.originFileObj;
        if (mdRaw) {
          try {
            const mdContent = await mdRaw.text();
            await uploadMarkdown(newPaper.id, mdContent);
          } catch {
            message.warning('论文已上传，但Markdown上传失败');
          }
        }
      }

      message.success('论文上传成功');
      resetForm();
      onSuccess();
      onClose();
    } catch {
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
  };

  const treeSelectData = buildTreeSelectData(folders);

  return (
    <Modal
      title="添加论文"
      open={open}
      onOk={handleUpload}
      onCancel={onClose}
      confirmLoading={uploading}
      destroyOnClose
      width={560}
      okText="上传"
      cancelText="取消"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Upload.Dragger
          accept=".pdf"
          maxCount={1}
          fileList={fileList}
          onChange={({ fileList: fl }) => setFileList(fl)}
          beforeUpload={() => false}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽PDF文件到此处</p>
        </Upload.Dragger>

        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Switch size="small" checked={autoExtract} onChange={setAutoExtract} />
            <span>自动获取元信息</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Switch size="small" checked={autoConvert} onChange={(v) => { setAutoConvert(v); if (v) setMdFileList([]); }} />
            <span>自动转换MD</span>
          </div>
        </div>

        <Input
          placeholder="标题（可选，默认使用文件名）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={autoExtract}
        />
        <Input
          placeholder="作者（逗号分隔）"
          value={authors}
          onChange={(e) => setAuthors(e.target.value)}
          disabled={autoExtract}
        />
        <Input
          placeholder="发表场地"
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          disabled={autoExtract}
        />
        <Input
          placeholder="发表时间（如 2024-01）"
          value={publishDate}
          onChange={(e) => setPublishDate(e.target.value)}
          disabled={autoExtract}
        />
        <Input.TextArea
          placeholder="简记"
          value={briefNote}
          onChange={(e) => setBriefNote(e.target.value)}
          rows={2}
        />
        <TreeSelect
          style={{ width: '100%' }}
          treeData={treeSelectData}
          value={folderIds}
          onChange={setFolderIds}
          treeCheckable
          showCheckedStrategy={TreeSelect.SHOW_ALL}
          placeholder="选择分类（可多选）"
          allowClear
        />
        <Input
          placeholder="标签（逗号分隔）"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />

        {!autoConvert && (
          <Upload.Dragger
            accept=".md"
            maxCount={1}
            fileList={mdFileList}
            onChange={({ fileList: fl }) => setMdFileList(fl)}
            beforeUpload={() => false}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">手动上传Markdown（可选）</p>
          </Upload.Dragger>
        )}
      </div>
    </Modal>
  );
}
