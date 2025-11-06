import React, { useState, useEffect, useRef } from 'react';
import { type ManagedReviewItem, ReviewCategory, ReviewItemStatus } from '../types';
import { marked } from 'marked';
import { Bug, ShieldAlert, Zap, Palette, Lightbulb, Check, X, Code2, Trash2, MessageSquare, User } from 'lucide-react';

const categoryConfig = {
  [ReviewCategory.BUG]: {
    Icon: Bug,
    color: 'text-red-400',
    leftBorderColor: 'border-red-400',
    bgColor: 'bg-red-900/20',
    title: 'CRITICAL_BUG',
  },
  [ReviewCategory.VULNERABILITY]: {
    Icon: ShieldAlert,
    color: 'text-yellow-400',
    leftBorderColor: 'border-yellow-400',
    bgColor: 'bg-yellow-900/20',
    title: 'SECURITY_VULNERABILITY',
  },
  [ReviewCategory.PERFORMANCE]: {
    Icon: Zap,
    color: 'text-purple-400',
    leftBorderColor: 'border-purple-400',
    bgColor: 'bg-purple-900/20',
    title: 'PERFORMANCE_ISSUE',
  },
  [ReviewCategory.STYLE]: {
    Icon: Palette,
    color: 'text-blue-400',
    leftBorderColor: 'border-blue-400',
    bgColor: 'bg-blue-900/20',
    title: 'STYLE_GUIDE_VIOLATION',
  },
  [ReviewCategory.SUGGESTION]: {
    Icon: Lightbulb,
    color: 'text-green-400',
    leftBorderColor: 'border-green-400',
    bgColor: 'bg-green-900/20',
    title: 'SUGGESTION',
  },
};

interface ReviewItemCardProps {
    item: ManagedReviewItem;
    index: number;
    onHighlight: (line: number | null) => void;
    onAccept: (itemId: string) => void;
    onReject: (itemId: string) => void;
    onAddComment: (itemId: string, comment: string) => void;
}

const ReviewItemCard: React.FC<ReviewItemCardProps> = ({ item, index, onHighlight, onAccept, onReject, onAddComment }) => {
    const config = categoryConfig[item.category];
    const [isExpanded, setIsExpanded] = useState(false);
    const [newComment, setNewComment] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isExpanded && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [isExpanded]);

    const createMarkup = (markdownText: string) => {
        const rawMarkup = marked.parse(markdownText, { breaks: true, gfm: true });
        return { __html: rawMarkup };
    };

    const handleCommentSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (newComment.trim()) {
            onAddComment(item.id, newComment.trim());
            setNewComment("");
        }
    };

    const cardStateClasses = {
        [ReviewItemStatus.PENDING]: `${config.leftBorderColor} ${config.bgColor} hover:bg-gray-800/50 cursor-pointer`,
        [ReviewItemStatus.ACCEPTED]: `border-green-500 bg-green-900/30`,
        [ReviewItemStatus.REJECTED]: `border-gray-600 bg-gray-900/30 opacity-60`,
    };

    return (
        <div 
            className={`border-l-4 border border-gray-800/50 rounded-r-md overflow-hidden transition-all duration-300 ${cardStateClasses[item.status]} opacity-0 animate-fade-in-up`}
            style={{ animationDelay: `${index * 100}ms`}}
            onClick={() => {
                setIsExpanded(!isExpanded);
                if (item.status === ReviewItemStatus.PENDING) {
                  onHighlight(item.line);
                }
            }}
            onMouseEnter={() => item.status === ReviewItemStatus.PENDING && onHighlight(item.line)}
            onMouseLeave={() => onHighlight(null)}
        >
            <div className="p-4 flex items-start gap-4">
                <div className={`mt-1 flex-shrink-0 ${config.color}`}>
                    <config.Icon className="h-5 w-5" />
                </div>
                <div className="flex-grow">
                    <div className="flex justify-between items-baseline">
                        <h3 className={`font-bold tracking-widest ${config.color}`}>{config.title}</h3>
                        {item.line !== null && (
                            <span className="text-xs font-mono bg-gray-700 text-gray-300 px-2 py-0.5 rounded-sm">
                                L:{item.line}
                            </span>
                        )}
                    </div>
                    <div 
                        className="prose prose-sm prose-invert mt-2 text-gray-300 max-w-none prose-p:text-gray-300 prose-code:text-accent/80 prose-code:bg-gray-800 prose-code:p-1 prose-code:rounded-sm prose-code:font-mono prose-pre:bg-gray-800 prose-pre:p-3 prose-pre:rounded-md"
                        dangerouslySetInnerHTML={createMarkup(item.comment)}
                    />
                </div>
            </div>

            {isExpanded && (
                <div className="px-4 pt-2 pb-4" onClick={e => e.stopPropagation()}>
                    <div className="border-t border-gray-700/50 mt-2 pt-3">
                        <h4 className="flex items-center gap-2 text-xs text-gray-400 font-semibold tracking-widest mb-3">
                            <MessageSquare className="h-4 w-4" />
                            <span>DISCUSSION</span>
                        </h4>
                        
                        <div className="space-y-3 mb-4 max-h-40 overflow-y-auto pr-2">
                            {item.userComments && item.userComments.length > 0 ? (
                                item.userComments.map((comment, i) => (
                                    <div key={i} className="flex items-start gap-2 text-sm animate-fade-in-up" style={{ animationDelay: `${i * 50}ms`}}>
                                        <div className="p-1.5 bg-gray-700 rounded-full mt-1 flex-shrink-0">
                                            <User className="h-3 w-3 text-gray-300" />
                                        </div>
                                        <div className="flex-1 bg-gray-800/60 px-3 py-2 rounded-md text-gray-300 min-w-0">
                                            <p className="break-words">{comment}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-xs text-gray-500 italic px-2">No comments yet. Start the conversation!</p>
                            )}
                        </div>

                        <form onSubmit={handleCommentSubmit} className="flex items-start gap-2">
                             <div className="p-1.5 bg-gray-700 rounded-full mt-1.5 flex-shrink-0">
                                <User className="h-3 w-3 text-gray-300" />
                            </div>
                            <div className="flex-1">
                                <textarea
                                    ref={textareaRef}
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Add your comment..."
                                    className="w-full bg-black/40 border border-gray-600 rounded-md p-2 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-accent/80 transition-shadow resize-y min-h-[40px]"
                                    rows={1}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleCommentSubmit(e);
                                        }
                                    }}
                                />
                                <div className="text-right mt-1.5">
                                    <button type="submit" className="px-3 py-1 bg-accent text-black text-xs font-bold rounded-sm hover:bg-white transition-colors disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed" disabled={!newComment.trim()}>
                                        SUBMIT
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {item.suggestion && item.status !== ReviewItemStatus.REJECTED && (
                <div className="px-4 pb-3">
                     <div className="flex items-center gap-2 text-xs text-accent/80 font-semibold tracking-widest mb-1.5">
                        <Code2 className="h-4 w-4" />
                        <span>SUGGESTED_CHANGE</span>
                    </div>
                    <pre className="bg-black/50 p-2 rounded-md text-sm font-mono overflow-x-auto">
                        <code className="text-gray-300">{item.suggestion}</code>
                    </pre>
                </div>
            )}

            {item.status === ReviewItemStatus.PENDING && (
                 <div className="bg-black/20 px-4 py-2 flex justify-end items-center gap-3">
                     <button
                        onClick={(e) => { e.stopPropagation(); onReject(item.id); }}
                        className="flex items-center gap-1.5 text-xs font-bold text-red-400 hover:text-white transition-colors"
                     >
                         <X className="h-4 w-4" /> REJECT
                     </button>
                     <button
                        onClick={(e) => { e.stopPropagation(); onAccept(item.id); }}
                        disabled={!item.suggestion}
                        className="flex items-center gap-1.5 text-xs font-bold text-green-400 hover:text-white transition-colors disabled:text-gray-600 disabled:cursor-not-allowed"
                     >
                         <Check className="h-4 w-4" /> ACCEPT
                     </button>
                 </div>
            )}
        </div>
    );
};

interface ReviewPanelProps {
    items: ManagedReviewItem[];
    onHighlight: (line: number | null) => void;
    onAccept: (itemId: string) => void;
    onReject: (itemId: string) => void;
    onClearAll: () => void;
    onAddComment: (itemId: string, comment: string) => void;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({ items, onHighlight, onAccept, onReject, onClearAll, onAddComment }) => {
  const handleClearClick = () => {
    if (window.confirm('Are you sure you want to clear all review items? This action cannot be undone.')) {
        onClearAll();
    }
  };

  return (
    <div className="space-y-4">
        <div className="flex justify-between items-center border-b