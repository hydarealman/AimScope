package com.aimscope.dto;

import javax.validation.constraints.NotBlank;

public class ParamUpdateRequest {
    @NotBlank
    private String content;
    private String message;

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}
