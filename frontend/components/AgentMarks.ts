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
                style: 'background-color: rgba(34, 197, 94, 0.15); color: rgb(34, 197, 94); padding: 2px 4px; border-radius: 4px; font-weight: 500; transition: all 0.3s ease;'
            },
            0,
        ]
    },


})