export interface ToolFunctionDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const TOOL_DEFINITIONS: Array<{ type: 'function'; function: ToolFunctionDef }> = [
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Tạo nhiệm vụ mới cho khóa học hiện tại',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Tên ngắn gọn của nhiệm vụ (tiếng Việt)' },
          dueDate: {
            type: 'string',
            description: 'Hạn chót dạng YYYY-MM-DD nếu đề bài có, ngược lại bỏ qua',
          },
          subtasks: {
            type: 'array',
            items: { type: 'string' },
            description: 'Các bước thực hiện ngắn gọn, 3-6 mục',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'Liệt kê toàn bộ nhiệm vụ của khóa học kèm taskId để cập nhật sau',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Cập nhật nhiệm vụ (cần taskId lấy từ list_tasks)',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['todo', 'doing', 'done'] },
          dueDate: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_materials',
      description: 'Tìm kiếm đoạn trích liên quan trong nội dung các tệp tài liệu của khóa học',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Từ khóa hoặc câu hỏi để tìm' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_excerpt',
      description: 'Đọc phần đầu nội dung của một tệp tài liệu theo path trong danh sách tệp',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Đường dẫn tệp như trong danh sách tệp' },
        },
        required: ['path'],
      },
    },
  },
];

const TOOL_LABELS: Record<string, string> = {
  create_task: 'Tạo nhiệm vụ',
  list_tasks: 'Xem danh sách nhiệm vụ',
  update_task: 'Cập nhật nhiệm vụ',
  search_materials: 'Tìm trong tài liệu',
  read_excerpt: 'Đọc tài liệu',
};

export function toolLabel(name: string, rawArgs: string): string {
  let argPart = '';
  try {
    const parsed = JSON.parse(rawArgs || '{}') as Record<string, unknown>;
    if (typeof parsed.title === 'string' && parsed.title) argPart = `: “${parsed.title}”`;
    else if (typeof parsed.query === 'string' && parsed.query) argPart = `: “${parsed.query}”`;
    else if (typeof parsed.path === 'string' && parsed.path) argPart = `: ${parsed.path}`;
  } catch {
    // không parse được args — chỉ hiện tên tool
  }
  return `${TOOL_LABELS[name] ?? name}${argPart}`;
}
