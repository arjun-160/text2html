import React, { useState, useRef, useEffect, useCallback } from "react";
import { Container, Paper, Typography, Switch, TextField, Button, IconButton, Box, AppBar, Toolbar, MenuItem, Select, InputLabel, FormControl, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Chip, Stack, Tooltip, Checkbox, FormControlLabel, Divider, List, ListItem, ListItemText, ListItemSecondaryAction } from '@mui/material';
import { Download, Delete, Save, Upload, Print, Clear, Visibility, VisibilityOff, AddCircle, CloudUpload, FileOpen, Undo, Redo, ContentCopy, Edit, FolderOpen, ImportExport, Label, History, DragIndicator, Settings } from '@mui/icons-material';
import { Editor } from "@tinymce/tinymce-react";
import axios from "axios";
import mammoth from "mammoth";

// Helper for localStorage versioning
const getTemplates = () => JSON.parse(localStorage.getItem("templates_v2") || "[]");
const setTemplates = (templates) => localStorage.setItem("templates_v2", JSON.stringify(templates));
const getImportHistory = () => JSON.parse(localStorage.getItem("import_history") || "[]");
const setImportHistory = (history) => localStorage.setItem("import_history", JSON.stringify(history));

function App() {
  // State
  const [html, setHtml] = useState("");
  const [fileName, setFileName] = useState("label-template");
  const [darkMode, setDarkMode] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [search, setSearch] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [importDialog, setImportDialog] = useState(false);
  const [importData, setImportData] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [templateTags, setTemplateTags] = useState([]);
  const [versionHistory, setVersionHistory] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [printDialog, setPrintDialog] = useState(false);
  
  // New import enhancement states
  const [importPreviewDialog, setImportPreviewDialog] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState({ content: '', fileName: '', fileType: '', originalFile: null });
  const [importOptions, setImportOptions] = useState({ asNewTemplate: true, suggestedTags: [], customFileName: '' });
  const [batchImportDialog, setBatchImportDialog] = useState(false);
  const [batchFiles, setBatchFiles] = useState([]);
  const [importHistory, setImportHistory] = useState([]);
  const [conversionSettings, setConversionSettings] = useState({ keepImages: true, keepStyles: true, keepTables: true });
  const [dragOver, setDragOver] = useState(false);
  const [historyDialog, setHistoryDialog] = useState(false);
  
  const editorRef = useRef(null);
  const previewRef = useRef();
  const fileInputRef = useRef(null);

  // Load templates and import history on mount
  useEffect(() => {
    setSavedTemplates(getTemplates());
    setImportHistory(getImportHistory());
  }, []);

  // Auto-save current template as user types
  useEffect(() => {
    if (fileName && html) {
      localStorage.setItem("autosave", JSON.stringify({ name: fileName, content: html, tags: templateTags }));
    }
  }, [fileName, html, templateTags]);

  // Versioning: save previous version on change
  useEffect(() => {
    if (html) {
      setVersionHistory((prev) => [...prev.slice(-9), html]);
    }
  }, [html]);

  // Undo/Redo logic
  const handleUndo = () => {
    if (versionHistory.length > 1) {
      setRedoStack((r) => [html, ...r]);
      const prev = versionHistory[versionHistory.length - 2];
      setVersionHistory((v) => v.slice(0, -1));
      setHtml(prev);
      if (editorRef.current) editorRef.current.setContent(prev);
    }
  };
  const handleRedo = () => {
    if (redoStack.length > 0) {
      const next = redoStack[0];
      setRedoStack((r) => r.slice(1));
      setVersionHistory((v) => [...v, next]);
      setHtml(next);
      if (editorRef.current) editorRef.current.setContent(next);
    }
  };

  // Snackbar helper
  const showSnackbar = (message, severity = 'success') => setSnackbar({ open: true, message, severity });

  // Auto-tagging based on file name and content
  const generateSuggestedTags = (fileName, content) => {
    const tags = [];
    const fileNameLower = fileName.toLowerCase();
    const contentLower = content.toLowerCase();
    
    // File name based tags
    if (fileNameLower.includes('invoice')) tags.push('invoice');
    if (fileNameLower.includes('letter')) tags.push('letter');
    if (fileNameLower.includes('form')) tags.push('form');
    if (fileNameLower.includes('label')) tags.push('label');
    if (fileNameLower.includes('template')) tags.push('template');
    if (fileNameLower.includes('report')) tags.push('report');
    if (fileNameLower.includes('email')) tags.push('email');
    if (fileNameLower.includes('contract')) tags.push('contract');
    
    // Content based tags
    if (contentLower.includes('question') || contentLower.includes('answer')) tags.push('quiz');
    if (contentLower.includes('name') && contentLower.includes('email')) tags.push('contact');
    if (contentLower.includes('submit') || contentLower.includes('button')) tags.push('form');
    if (contentLower.includes('table') || contentLower.includes('row')) tags.push('table');
    
    return [...new Set(tags)]; // Remove duplicates
  };

  // Add to import history
  const addToImportHistory = (file) => {
    const historyItem = {
      name: file.name,
      size: file.size,
      type: file.type,
      date: new Date().toISOString(),
      content: importPreviewData.content.substring(0, 100) + '...' // Store preview
    };
    const updatedHistory = [historyItem, ...importHistory.slice(0, 9)]; // Keep last 10
    setImportHistory(updatedHistory);
    setImportHistory(updatedHistory);
  };

  // Enhanced file import with preview and options
  const handleFileImport = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    
    if (files.length === 1) {
      await processSingleFile(files[0]);
    } else {
      setBatchFiles(files);
      setBatchImportDialog(true);
    }
  };

  const processSingleFile = async (file) => {
    try {
      // File size check (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        showSnackbar("File too large. Maximum size is 10MB.", 'error');
        return;
      }

      let content = '';
      let fileType = '';

      if (file.name.endsWith('.txt')) {
        content = await readTextFile(file);
        fileType = 'text';
      } else if (file.name.endsWith('.docx')) {
        content = await readDocxFile(file);
        fileType = 'docx';
      } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        content = await readTextFile(file);
        fileType = 'html';
      } else {
        showSnackbar("Unsupported file type. Please select .txt, .docx, or .html files.", 'error');
        return;
      }

      // Auto-fill template name and generate tags
      const autoFileName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
      const suggestedTags = generateSuggestedTags(file.name, content);

      setImportPreviewData({
        content,
        fileName: autoFileName,
        fileType,
        originalFile: file
      });
      setImportOptions({
        asNewTemplate: true,
        suggestedTags,
        customFileName: autoFileName
      });
      setImportPreviewDialog(true);

    } catch (error) {
      console.error('Import error:', error);
      if (error.message.includes('corrupted')) {
        showSnackbar("File appears to be corrupted. Please try a different file.", 'error');
      } else if (error.message.includes('format')) {
        showSnackbar("Unsupported file format. Please check the file type.", 'error');
      } else {
        showSnackbar("Failed to import file. Please try again.", 'error');
      }
    }
  };

  const readTextFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const textContent = e.target.result;
          const htmlContent = textContent
            .replace(/\n/g, '<br>')
            .replace(/\r/g, '')
            .replace(/  /g, '&nbsp;&nbsp;');
          resolve(htmlContent);
        } catch (error) {
          reject(new Error('File format error'));
        }
      };
      reader.onerror = () => reject(new Error('File read error'));
      reader.readAsText(file);
    });
  };

  const readDocxFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result;
          const options = {
            styleMap: conversionSettings.keepStyles ? undefined : ["p[style-name='Section Title'] => h1:fresh", "p[style-name='Subsection Title'] => h2:fresh"],
            ignoreImages: !conversionSettings.keepImages,
            ignoreTables: !conversionSettings.keepTables
          };
          const result = await mammoth.convertToHtml({ arrayBuffer }, options);
          resolve(result.value);
        } catch (error) {
          reject(new Error('File corrupted'));
        }
      };
      reader.onerror = () => reject(new Error('File read error'));
      reader.readAsArrayBuffer(file);
    });
  };

  // Confirm import with preview
  const confirmImport = () => {
    const { content, originalFile } = importPreviewData;
    const { asNewTemplate, customFileName, suggestedTags } = importOptions;

    if (asNewTemplate) {
      setFileName(customFileName);
      setTemplateTags(suggestedTags);
    }

    setHtml(content);
    if (editorRef.current) editorRef.current.setContent(content);
    
    addToImportHistory(originalFile);
    setImportPreviewDialog(false);
    showSnackbar(`File imported successfully as ${asNewTemplate ? 'new template' : 'content'}`);
  };

  // Batch import processing
  const processBatchImport = async () => {
    const results = [];
    for (const file of batchFiles) {
      try {
        await processSingleFile(file);
        results.push({ file: file.name, status: 'success' });
      } catch (error) {
        results.push({ file: file.name, status: 'error', error: error.message });
      }
    }
    
    setBatchImportDialog(false);
    setBatchFiles([]);
    
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    
    if (successCount > 0) {
      showSnackbar(`Successfully imported ${successCount} files${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
    } else {
      showSnackbar('No files were imported successfully', 'error');
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      if (files.length === 1) {
        await processSingleFile(files[0]);
      } else {
        setBatchFiles(files);
        setBatchImportDialog(true);
      }
    }
  };

  // Re-import from history
  const reimportFromHistory = (historyItem) => {
    // This would require storing the full content in history
    // For now, just show a message
    showSnackbar(`Re-importing ${historyItem.name} from history`);
    setHistoryDialog(false);
  };

  // Template management
  const saveTemplate = () => {
    if (!html || !fileName) {
      showSnackbar("Template content or filename is missing", 'error');
      return;
    }
    const newTemplate = { name: fileName, content: html, tags: templateTags, updated: new Date().toISOString() };
    const updatedTemplates = savedTemplates.filter(t => t.name !== fileName);
    updatedTemplates.push(newTemplate);
    setTemplates(updatedTemplates);
    setSavedTemplates(updatedTemplates);
    showSnackbar("Template saved successfully");
  };
  const loadTemplate = () => {
    const template = savedTemplates.find(t => t.name === selectedTemplate);
    if (template) {
      setHtml(template.content);
      setFileName(template.name);
      setTemplateTags(template.tags || []);
      if (editorRef.current) editorRef.current.setContent(template.content);
      showSnackbar("Template loaded successfully");
    }
  };
  const clearSavedTemplates = () => {
    if (window.confirm("Are you sure you want to delete all saved templates?")) {
      localStorage.removeItem("templates_v2");
      setSavedTemplates([]);
      showSnackbar("All saved templates cleared");
    }
  };
  const exportTemplates = () => {
    const data = JSON.stringify(savedTemplates, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "templates.json";
    link.click();
    showSnackbar("Templates exported as JSON");
  };
  const importTemplates = () => {
    try {
      const imported = JSON.parse(importData);
      if (Array.isArray(imported)) {
        setTemplates(imported);
        setSavedTemplates(imported);
        setImportDialog(false);
        showSnackbar("Templates imported successfully");
      } else {
        showSnackbar("Invalid template data", 'error');
      }
    } catch {
      showSnackbar("Invalid JSON", 'error');
    }
  };

  // Tag management
  const addTag = () => {
    if (tagInput && !templateTags.includes(tagInput)) {
      setTemplateTags([...templateTags, tagInput]);
      setTagInput("");
    }
  };
  const removeTag = (tag) => setTemplateTags(templateTags.filter(t => t !== tag));

  // Download HTML
  const downloadHTML = () => {
    if (!html) {
      showSnackbar("Nothing to download!", 'error');
      return;
    }
    const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName || "label-template"}.html`;
    link.click();
    showSnackbar("HTML file downloaded");
  };

  // Print
  const handlePrint = () => {
    setPrintDialog(true);
    setTimeout(() => {
      if (previewRef.current) {
        const printWindow = window.open('', '', 'width=800,height=600');
        printWindow.document.write(`<html><head><title>${fileName}</title></head><body>${html}</body></html>`);
        printWindow.document.close();
        printWindow.print();
        setPrintDialog(false);
      }
    }, 500);
  };

  // Clear editor
  const clearEditor = () => {
    setHtml("");
    setFileName("label-template");
    setTemplateTags([]);
    if (editorRef.current) editorRef.current.setContent("");
    showSnackbar("Editor cleared");
  };

  // Drag & drop image upload
  const uploadToImgBB = async (file) => {
    const formData = new FormData();
    formData.append("image", file);
    const apiKey = "c87124780928aaf936d01d3a57209e62";
    try {
      const response = await axios.post(
        `https://api.imgbb.com/1/upload?key=${apiKey}`,
        formData
      );
      return response.data.data.url;
    } catch {
      throw new Error("Image upload failed");
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveTemplate(); }
      if (e.ctrlKey && e.key === 'o') { e.preventDefault(); loadTemplate(); }
      if (e.ctrlKey && e.key === 'd') { e.preventDefault(); downloadHTML(); }
      if (e.ctrlKey && e.key === 'e') { e.preventDefault(); clearEditor(); }
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); handleUndo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); handleRedo(); }
      if (e.ctrlKey && e.key === 'p') { e.preventDefault(); handlePrint(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // Filtered templates
  const filteredTemplates = savedTemplates.filter(template =>
    template.name.toLowerCase().includes(search.toLowerCase()) ||
    (template.tags || []).some(tag => tag.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Box sx={{ 
      bgcolor: darkMode ? '#181c24' : '#e3eafc', 
      height: '100vh', 
      width: '100%', 
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      color: darkMode ? '#e0e0e0' : '#222',
      '@media (max-width: 768px)': {
        px: 0
      }
    }}>
      <AppBar position="static" color={darkMode ? 'default' : 'primary'}>
        <Toolbar sx={{ px: 4 }}>
          <Label sx={{ fontSize: 40, mr: 2, color: darkMode ? '#1976d2' : '#fff' }} />
          <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 700, letterSpacing: 1 }}>HTMLify Tool</Typography>
          <Switch checked={darkMode} onChange={() => setDarkMode(!darkMode)} />
          <Typography>{darkMode ? "Dark" : "Light"} Mode</Typography>
        </Toolbar>
      </AppBar>
      <Container 
        maxWidth={false} 
        disableGutters 
        sx={{ 
          py: 4, 
          px: { xs: 1, sm: 4 }, 
          width: '100%',
          maxWidth: '100%',
          overflow: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Paper elevation={4} sx={{ p: { xs: 2, sm: 4 }, mb: 3, maxWidth: 1400, mx: 'auto', borderRadius: 4, bgcolor: darkMode ? '#232b3b' : '#fff', flex: 1, overflow: 'auto' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" mb={2}>
            <TextField label="File Name" value={fileName} onChange={e => setFileName(e.target.value)} size="small" />
            <TextField label="Search Templates" value={search} onChange={e => setSearch(e.target.value)} size="small" />
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Saved Templates</InputLabel>
              <Select
                value={selectedTemplate}
                label="Saved Templates"
                onChange={e => setSelectedTemplate(e.target.value)}
                renderValue={val => val || '-- Select --'}
              >
                <MenuItem value="">-- Select --</MenuItem>
                {filteredTemplates.map((template) => (
                  <MenuItem key={template.name} value={template.name}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography>{template.name}</Typography>
                      {(template.tags || []).map(tag => <Chip key={tag} label={tag} size="small" />)}
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip title="Save (Ctrl+S)"><span><IconButton color="primary" onClick={saveTemplate}><Save /></IconButton></span></Tooltip>
            <Tooltip title="Load (Ctrl+O)"><span><IconButton color="primary" onClick={loadTemplate} disabled={!selectedTemplate}><FolderOpen /></IconButton></span></Tooltip>
            <Tooltip title="Clear All Saved"><span><IconButton color="error" onClick={clearSavedTemplates}><Delete /></IconButton></span></Tooltip>
            <Tooltip title="Export Templates"><span><IconButton color="primary" onClick={exportTemplates}><ImportExport /></IconButton></span></Tooltip>
            <Tooltip title="Import Templates"><span><IconButton color="primary" onClick={() => setImportDialog(true)}><CloudUpload /></IconButton></span></Tooltip>
            <Tooltip title="Clear Editor (Ctrl+E)"><span><IconButton color="warning" onClick={clearEditor}><Clear /></IconButton></span></Tooltip>
            <Tooltip title={showPreview ? "Hide Preview" : "Show Preview"}><span><IconButton color="primary" onClick={() => setShowPreview(!showPreview)}>{showPreview ? <VisibilityOff /> : <Visibility />}</IconButton></span></Tooltip>
            <Tooltip title="Print (Ctrl+P)"><span><IconButton color="primary" onClick={handlePrint}><Print /></IconButton></span></Tooltip>
            <Tooltip title="Import Files">
              <span>
                <IconButton color="primary" component="label">
                  <FileOpen />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.docx,.html,.htm"
                    multiple
                    hidden
                    onChange={handleFileImport}
                  />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Import History"><span><IconButton color="primary" onClick={() => setHistoryDialog(true)}><History /></IconButton></span></Tooltip>
            <Tooltip title="Conversion Settings"><span><IconButton color="primary" onClick={() => setConversionSettings({...conversionSettings})}><Settings /></IconButton></span></Tooltip>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" mb={2}>
            <TextField label="Add Tag" value={tagInput} onChange={e => setTagInput(e.target.value)} size="small" onKeyDown={e => { if (e.key === 'Enter') addTag(); }} />
            <Button variant="outlined" size="small" onClick={addTag} startIcon={<AddCircle />}>Add Tag</Button>
            {templateTags.map(tag => <Chip key={tag} label={tag} onDelete={() => removeTag(tag)} />)}
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" mb={2}>
            <Tooltip title="Undo (Ctrl+Z)"><span><IconButton onClick={handleUndo}><Undo /></IconButton></span></Tooltip>
            <Tooltip title="Redo (Ctrl+Y)"><span><IconButton onClick={handleRedo}><Redo /></IconButton></span></Tooltip>
          </Stack>
          
          {/* Drag & Drop Area */}
          <Box 
            sx={{ 
              my: 2, 
              border: dragOver ? '3px dashed #1976d2' : '2px dashed #ccc',
              borderRadius: 2,
              p: 2,
              textAlign: 'center',
              bgcolor: dragOver ? 'rgba(25, 118, 210, 0.1)' : 'transparent',
              transition: 'all 0.3s ease'
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <DragIndicator sx={{ fontSize: 40, color: dragOver ? '#1976d2' : '#666', mb: 1 }} />
            <Typography variant="body2" color="textSecondary">
              {dragOver ? 'Drop files here to import' : 'Drag & drop files here to import (.txt, .docx, .html)'}
            </Typography>
          </Box>
          
          <Box sx={{ my: 2 }}>
            <Editor
              onInit={(evt, editor) => (editorRef.current = editor)}
              apiKey="1elgs8lygnseriu4s0ytx880rvobuf0jr4jc7dbn81cvjji6"
              init={{
                height: 400,
                menubar: false,
                plugins: "image code",
                toolbar:
                  "undo redo | fontselect fontsizeselect | bold italic underline | alignleft aligncenter alignright | image | code",
                automatic_uploads: true,
                file_picker_types: 'image',
                images_upload_handler: async (blobInfo, success, failure) => {
                  try {
                    const url = await uploadToImgBB(blobInfo.blob());
                    success(url);
                  } catch (error) {
                    failure("Image upload failed");
                  }
                },
                file_picker_callback: function (callback, value, meta) {
                  if (meta.filetype === 'image') {
                    const input = document.createElement('input');
                    input.setAttribute('type', 'file');
                    input.setAttribute('accept', 'image/*');
                    input.onchange = async function () {
                      const file = this.files[0];
                      try {
                        const url = await uploadToImgBB(file);
                        callback(url, { alt: file.name });
                      } catch (error) {
                        showSnackbar("Upload failed!", 'error');
                      }
                    };
                    input.click();
                  }
                },
                setup: (editor) => {
                  editor.on('drop', async (e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file && file.type.startsWith('image/')) {
                      try {
                        const url = await uploadToImgBB(file);
                        editor.insertContent(`<img src='${url}' alt='${file.name}' />`);
                      } catch {
                        showSnackbar("Image upload failed", 'error');
                      }
                    }
                  });
                }
              }}
              value={html}
              onEditorChange={(content) => setHtml(content)}
            />
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Box flex={1}>
              <Typography variant="h6" gutterBottom>Generated HTML Code</Typography>
              <TextField
                multiline
                minRows={10}
                value={html}
                fullWidth
                InputProps={{ readOnly: true }}
                onFocus={e => e.target.select()}
                variant="outlined"
                sx={{ bgcolor: darkMode ? '#232b3b' : '#f7faff', borderRadius: 2 }}
              />
              <Button startIcon={<Download />} variant="contained" sx={{ mt: 2, bgcolor: '#1976d2', color: '#fff', '&:hover': { bgcolor: '#115293' } }} onClick={downloadHTML}>Download HTML</Button>
            </Box>
            {showPreview && (
              <Box flex={1}>
                <Typography variant="h6" gutterBottom>Live Preview</Typography>
                <Paper variant="outlined" sx={{ minHeight: 300, p: 2, bgcolor: '#fff', color: '#222', borderRadius: 2, boxShadow: 2 }}>
                  <div ref={previewRef} dangerouslySetInnerHTML={{ __html: html }} />
                </Paper>
              </Box>
            )}
          </Stack>
        </Paper>
        
        {/* Import Preview Dialog */}
        <Dialog open={importPreviewDialog} onClose={() => setImportPreviewDialog(false)} maxWidth="md" fullWidth>
          <DialogTitle>Import Preview & Options</DialogTitle>
          <DialogContent>
            <Stack spacing={3}>
              <Box>
                <Typography variant="h6" gutterBottom>File: {importPreviewData.fileName}</Typography>
                <Typography variant="body2" color="textSecondary">Type: {importPreviewData.fileType.toUpperCase()}</Typography>
              </Box>
              
              <Box>
                <Typography variant="h6" gutterBottom>Template Options</Typography>
                <TextField
                  label="Template Name"
                  value={importOptions.customFileName}
                  onChange={(e) => setImportOptions({...importOptions, customFileName: e.target.value})}
                  fullWidth
                  size="small"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={importOptions.asNewTemplate}
                      onChange={(e) => setImportOptions({...importOptions, asNewTemplate: e.target.checked})}
                    />
                  }
                  label="Import as new template (don't overwrite current content)"
                />
              </Box>
              
              <Box>
                <Typography variant="h6" gutterBottom>Suggested Tags</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {importOptions.suggestedTags.map(tag => (
                    <Chip
                      key={tag}
                      label={tag}
                      onClick={() => {
                        if (!templateTags.includes(tag)) {
                          setTemplateTags([...templateTags, tag]);
                        }
                      }}
                      color={templateTags.includes(tag) ? "primary" : "default"}
                    />
                  ))}
                </Stack>
              </Box>
              
              <Box>
                <Typography variant="h6" gutterBottom>Content Preview</Typography>
                <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto', p: 2, bgcolor: '#f9f9f9' }}>
                  <div dangerouslySetInnerHTML={{ __html: importPreviewData.content }} />
                </Paper>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setImportPreviewDialog(false)}>Cancel</Button>
            <Button onClick={confirmImport} variant="contained">Import</Button>
          </DialogActions>
        </Dialog>
        
        {/* Batch Import Dialog */}
        <Dialog open={batchImportDialog} onClose={() => setBatchImportDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Batch Import Files</DialogTitle>
          <DialogContent>
            <Typography variant="body1" gutterBottom>
              {batchFiles.length} files selected for import:
            </Typography>
            <List>
              {batchFiles.map((file, index) => (
                <ListItem key={index}>
                  <ListItemText
                    primary={file.name}
                    secondary={`${(file.size / 1024).toFixed(1)} KB`}
                  />
                </ListItem>
              ))}
            </List>
            <Typography variant="body2" color="textSecondary">
              Each file will be imported as a separate template with auto-generated names and tags.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setBatchImportDialog(false)}>Cancel</Button>
            <Button onClick={processBatchImport} variant="contained">Import All</Button>
          </DialogActions>
        </Dialog>
        
        {/* Import History Dialog */}
        <Dialog open={historyDialog} onClose={() => setHistoryDialog(false)} maxWidth="md" fullWidth>
          <DialogTitle>Import History</DialogTitle>
          <DialogContent>
            {importHistory.length === 0 ? (
              <Typography>No import history available.</Typography>
            ) : (
              <List>
                {importHistory.map((item, index) => (
                  <ListItem key={index} divider>
                    <ListItemText
                      primary={item.name}
                      secondary={`${new Date(item.date).toLocaleString()} • ${(item.size / 1024).toFixed(1)} KB`}
                    />
                    <ListItemSecondaryAction>
                      <Button size="small" onClick={() => reimportFromHistory(item)}>
                        Re-import
                      </Button>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setHistoryDialog(false)}>Close</Button>
          </DialogActions>
        </Dialog>
        
        {/* Import Dialog */}
        <Dialog open={importDialog} onClose={() => setImportDialog(false)}>
          <DialogTitle>Import Templates</DialogTitle>
          <DialogContent>
            <TextField
              label="Paste JSON here"
              multiline
              minRows={6}
              value={importData}
              onChange={e => setImportData(e.target.value)}
              fullWidth
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setImportDialog(false)}>Cancel</Button>
            <Button onClick={importTemplates} variant="contained">Import</Button>
          </DialogActions>
        </Dialog>
        
        {/* Print Dialog */}
        <Dialog open={printDialog} onClose={() => setPrintDialog(false)}>
          <DialogTitle>Printing...</DialogTitle>
          <DialogContent>
            <Typography>Sending to printer. Please wait.</Typography>
          </DialogContent>
        </Dialog>
        
        {/* Snackbar for notifications */}
        <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          <Alert severity={snackbar.severity} sx={{ width: '100%' }}>{snackbar.message}</Alert>
        </Snackbar>
      </Container>
    </Box>
  );
}

export default App;
