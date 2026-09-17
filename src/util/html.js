// HTML 템플릿에 문자열을 끼워 넣을 때 쓰는 이스케이프 한 곳.
// 속성값은 반드시 쌍따옴표로 감싸야 한다(따옴표는 &quot;로만 바꾼다).
export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
