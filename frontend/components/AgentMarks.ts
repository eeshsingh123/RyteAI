import { Mark } from '@tiptap/core'

// Mark for highlighting AI responses temporarily in light green
export const AIResponse = Mark.create({
    name: 'aiResponse',

    addOptions() {
        return {
            HTMLAttributes: {},
        }
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-ai-response]',
            },
        ]
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'span',
            {
                ...HTMLAttributes,
                'data-ai-response': '',
                style: 'background-color: rgba(34, 197, 94, 0.2); color: inherit; border-radius: 2px; transition: background-color 0.3s ease;'
            },
            0,
        ]
    },


})