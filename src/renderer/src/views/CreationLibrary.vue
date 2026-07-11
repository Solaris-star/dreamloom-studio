<template>
  <section class="creation-library-page">
    <header v-if="activeSection !== 'bookshelf'" class="library-header">
      <div>
        <p class="eyebrow">创作库</p>
        <h1>{{ pageMeta.title }}</h1>
        <p>{{ pageMeta.description }}</p>
      </div>
      <div v-if="activeSection !== 'bookshelf'" class="header-actions">
        <el-button v-motion-feedback :loading="loading" @click="loadLibrary">刷新</el-button>
      </div>
    </header>

    <nav v-if="activeSection !== 'bookshelf'" class="library-section-nav" aria-label="创作库子页面">
      <button
        v-for="item in librarySectionLinks"
        :key="item.key"
        type="button"
        :class="{ active: activeSection === item.key }"
        :aria-current="activeSection === item.key ? 'page' : undefined"
        @click="openLibrarySection(item)"
      >
        <component :is="item.icon" :size="16" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <section
      v-if="activeSection === 'bookshelf'"
      class="bookshelf-page"
      @dragover.prevent
      @drop.prevent="handleBookshelfDrop"
    >
      <div class="bookshelf-toolbar">
        <el-input
          v-model="keyword"
          clearable
          :placeholder="searchPlaceholder"
          @keyup.enter.prevent="handleUnifiedSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-popover
          placement="bottom-end"
          trigger="click"
          width="220"
          popper-class="bookshelf-filter-popover"
        >
          <template #reference>
            <button
              type="button"
              class="icon-filter-button"
              :class="{ active: bookFilter !== 'all' }"
              title="筛选书架"
            >
              <SlidersHorizontal :size="17" />
              <span>{{ currentBookFilterLabel }}</span>
            </button>
          </template>
          <div class="compact-filter-menu">
            <button
              v-for="filter in bookFilters"
              :key="filter.key"
              type="button"
              :class="{ active: bookFilter === filter.key }"
              @click="bookFilter = filter.key"
            >
              <span>{{ filter.label }}</span>
              <b>{{ bookFilterCount(filter.key) }}</b>
            </button>
          </div>
        </el-popover>
      </div>

      <main class="bookshelf-layout" :class="{ 'has-preview': selectedBook }">
        <section class="shelf-card">
          <div class="section-title">
            <div>
              <h2>小说书架</h2>
            </div>
            <div v-if="selectedBookKeys.length" class="section-actions">
              <span>已选 {{ selectedBookKeys.length }} 本</span>
              <el-button
                v-motion-feedback
                type="danger"
                plain
                :loading="deletingBookKey === 'batch'"
                @click="deleteSelectedShelfBooks"
              >
                <Trash2 :size="15" />
                移除选中
              </el-button>
            </div>
          </div>

          <div v-if="libraryLoadErrors.books" class="read-error-card">
            <strong>书架读取失败</strong>
            <span>{{ libraryLoadErrors.books }}</span>
            <button v-motion-feedback type="button" @click="loadLibrary">重试</button>
          </div>
          <div
            v-else
            v-motion-list="{ selector: '.book-card', key: bookListMotionKey }"
            class="book-grid"
          >
            <!-- 添加书籍卡片 -->
            <article class="book-card add-book-card" @click="openAddBookDialog">
              <div class="add-book-icon">
                <Plus :size="28" />
              </div>
              <div class="add-book-info">
                <h3>添加书籍</h3>
                <p>下载服务器书源或导入本地文本</p>
              </div>
            </article>
            <article
              v-for="book in pagedBooks"
              :key="bookKey(book)"
              class="book-card"
              :class="{
                selected: selectedBookKey === bookKey(book),
                checked: isBookSelected(book)
              }"
              @click="selectBook(book)"
              @dblclick="openAssetStudio(book)"
            >
              <label class="book-select" @click.stop>
                <input
                  type="checkbox"
                  :checked="isBookSelected(book)"
                  :aria-label="`选择书籍：${bookTitle(book)}`"
                  @change="toggleBookSelection(book, $event.target.checked)"
                />
                <span>选择</span>
              </label>
              <div
                class="book-cover"
                :class="{ placeholder: !hasBookCover(book) }"
                :style="bookCoverStyle(book)"
              >
                <span v-if="!hasBookCover(book)" class="book-mark"></span>
              </div>
              <div class="book-info">
                <div class="book-card-head">
                  <span :title="bookTypeLabel(book)">
                    <Download v-if="isDownloadedBook(book)" :size="13" />
                    <Archive v-else-if="isImportedBook(book)" :size="13" />
                    <Bookmark v-else-if="isReferenceBook(book)" :size="13" />
                    <BookOpen v-else :size="13" />
                  </span>
                </div>
                <h3>{{ bookTitle(book) }}</h3>
                <p>{{ book.intro || '暂无简介' }}</p>
                <div class="meta-line">
                  <span>{{ formatWords(bookWordCount(book)) }}</span>
                  <span>{{ chapterCountText(book) }}</span>
                  <span>{{ formatDate(bookUpdatedAt(book)) }}</span>
                </div>
                <div class="asset-mini-row">
                  <span v-for="item in assetSummaryForBook(book).slice(0, 2)" :key="item.label">
                    {{ item.label }} {{ item.value }}
                  </span>
                </div>
              </div>
              <div class="quick-actions">
                <button v-motion-feedback type="button" @click.stop="openStudio(book)">
                  打开创作台
                </button>
                <button v-motion-feedback type="button" @click.stop="openAssetStudio(book)">
                  进入资产台
                </button>
              </div>
            </article>
          </div>
          <div
            v-if="shouldShowPagination('books', filteredBooks.length)"
            class="library-pagination"
          >
            <span>{{ paginationSummary('books', filteredBooks.length) }}</span>
            <el-pagination
              layout="prev, pager, next, sizes, total"
              :total="filteredBooks.length"
              :current-page="listPage.books"
              :page-size="listPageSize.books"
              :page-sizes="libraryPageSizes"
              @current-change="setListPage('books', $event)"
              @size-change="handleListPageSizeChange('books', $event)"
            />
          </div>
          <div v-else-if="!filteredBooks.length" class="soft-empty">
            <strong>{{ keyword ? '书架里没有找到这本书' : '书架暂无内容' }}</strong>
            <span>{{
              keyword
                ? '可以直接去书源搜索并下载到书架。'
                : '搜索书源并下载后，会在这里统一管理下载书籍。'
            }}</span>
            <button v-motion-feedback type="button" @click="handleUnifiedSearch">
              {{ keyword ? '搜索书源' : '去下载小说' }}
            </button>
          </div>
        </section>

        <aside v-if="selectedBook" class="preview-card">
          <div
            class="preview-cover"
            :class="{ placeholder: !hasBookCover(selectedBook) }"
            :style="bookCoverStyle(selectedBook)"
          >
            <span v-if="!hasBookCover(selectedBook)" class="book-mark"></span>
          </div>
          <div class="preview-main">
            <span class="type-pill book-type-icon" :title="bookTypeLabel(selectedBook)">
              <Download v-if="isDownloadedBook(selectedBook)" :size="14" />
              <Archive v-else-if="isImportedBook(selectedBook)" :size="14" />
              <Bookmark v-else-if="isReferenceBook(selectedBook)" :size="14" />
              <BookOpen v-else :size="14" />
            </span>
            <h2>{{ bookTitle(selectedBook) }}</h2>
            <p>{{ selectedBook.intro || '暂无简介' }}</p>
          </div>
          <dl class="preview-meta">
            <div>
              <dt>状态</dt>
              <dd>{{ bookStatusLabel(selectedBook) }}</dd>
            </div>
            <div>
              <dt>字数</dt>
              <dd>{{ formatWords(bookWordCount(selectedBook)) }}</dd>
            </div>
            <div>
              <dt>章节</dt>
              <dd>{{ chapterCountText(selectedBook) }}</dd>
            </div>
            <div>
              <dt>最近更新</dt>
              <dd>{{ formatDate(bookUpdatedAt(selectedBook)) }}</dd>
            </div>
          </dl>
          <div class="preview-tags">
            <span v-for="tag in bookTags(selectedBook)" :key="tag">{{ tag }}</span>
          </div>
          <section class="asset-status-panel">
            <h3>资产状态</h3>
            <div>
              <span v-for="item in assetSummaryForBook(selectedBook)" :key="item.label">
                <b>{{ item.label }}</b>
                <strong>{{ item.value }}</strong>
              </span>
            </div>
          </section>
          <section class="recent-action-panel">
            <h3>最近操作</h3>
            <p>{{ recentActionText(selectedBook) }}</p>
          </section>
          <div class="preview-actions">
            <el-button v-motion-feedback type="primary" @click="openAssetStudio(selectedBook)"
              >进入资产台</el-button
            >
            <el-button v-motion-feedback @click="openStudio(selectedBook)">打开创作台</el-button>
            <el-button
              v-if="isDownloadedBook(selectedBook)"
              v-motion-feedback
              @click="openStudio(selectedBook, 'read')"
              >阅读模式</el-button
            >
            <el-button
              v-if="shouldShowSplitAction(selectedBook)"
              v-motion-feedback
              @click="openSplitDialog(selectedBook)"
            >
              {{ splitActionLabel(selectedBook) }}
            </el-button>
            <el-button v-motion-feedback @click="router.push('/knowledge/images')"
              >管理图片</el-button
            >
            <el-button
              v-motion-feedback
              type="danger"
              plain
              :loading="deletingBookKey === bookKey(selectedBook)"
              @click="deleteShelfBook(selectedBook)"
            >
              <Trash2 :size="15" />
              移除书籍
            </el-button>
          </div>
        </aside>
      </main>
    </section>

    <section v-else-if="activeSection === 'materials'" class="manager-grid">
      <aside class="side-filter card-panel">
        <button
          v-for="item in materialFilters"
          :key="item.key"
          type="button"
          :class="{ active: materialFilter === item.key }"
          @click="materialFilter = item.key"
        >
          <span>{{ item.label }}</span>
          <b>{{ materialCount(item.key) }}</b>
        </button>
      </aside>

      <main class="list-panel card-panel">
        <div class="panel-toolbar">
          <el-input v-model="keyword" clearable placeholder="搜索素材标题、内容、来源或标签">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button
            v-motion-feedback
            :disabled="!selectedMaterialIds.length"
            :loading="batchDeletingMaterials"
            @click="deleteSelectedMaterials"
          >
            删除选中{{ selectedMaterialIds.length ? ` ${selectedMaterialIds.length}` : '' }}
          </el-button>
          <el-tag
            v-if="materialBookKey"
            class="material-book-filter-tag"
            closable
            disable-transitions
            @close="clearMaterialBookFilter"
          >
            本书：{{ materialBookFilterLabel }}
          </el-tag>
          <el-button v-motion-feedback type="primary" @click="openMaterialDialog()"
            >新增素材</el-button
          >
        </div>
        <div v-if="materialsLoadError" class="read-error-card">
          <strong>素材读取失败</strong>
          <span>{{ materialsLoadError }}</span>
          <button v-motion-feedback type="button" @click="loadLibrary">重试</button>
        </div>
        <div
          v-else-if="filteredMaterials.length"
          v-motion-list="{ selector: '.material-card', key: materialListMotionKey }"
          class="material-list"
        >
          <article
            v-for="item in pagedMaterials"
            :key="item.id"
            class="material-card"
            :class="{
              selected: selectedMaterial?.id === item.id,
              checked: selectedMaterialIds.includes(item.id)
            }"
            @click="selectedMaterialId = item.id"
          >
            <label class="material-select" @click.stop>
              <input
                v-model="selectedMaterialIds"
                type="checkbox"
                :value="item.id"
                :aria-label="`选择素材：${item.title || '未命名素材'}`"
              />
              <span>选择</span>
            </label>
            <div>
              <span class="type-pill">{{ materialTypeLabel(item) }}</span>
              <h3>{{ item.title || '未命名素材' }}</h3>
              <p>{{ item.summary || item.content || '暂无摘要' }}</p>
            </div>
            <div class="meta-line">
              <span>{{ materialSourceLabel(item) }}</span>
              <span>{{ bindingStatusLabel(item) }}</span>
              <span>{{ formatDate(item.updatedAt || item.createdAt) }}</span>
            </div>
          </article>
        </div>
        <div
          v-if="shouldShowPagination('materials', filteredMaterials.length)"
          class="library-pagination"
        >
          <span>{{ paginationSummary('materials', filteredMaterials.length) }}</span>
          <el-pagination
            layout="prev, pager, next, sizes, total"
            :total="filteredMaterials.length"
            :current-page="listPage.materials"
            :page-size="listPageSize.materials"
            :page-sizes="libraryPageSizes"
            @current-change="setListPage('materials', $event)"
            @size-change="handleListPageSizeChange('materials', $event)"
          />
        </div>
        <div v-else-if="!filteredMaterials.length" class="soft-empty">
          <strong>暂无素材</strong>
          <span>这里收纳还没绑定到具体作品的灵感、摘录、拆书片段和待整理资料。</span>
          <button v-motion-feedback type="button" @click="openMaterialDialog()">新增素材</button>
        </div>
      </main>

      <aside class="detail-card card-panel">
        <template v-if="selectedMaterial">
          <span class="type-pill">{{ materialTypeLabel(selectedMaterial) }}</span>
          <h2>{{ selectedMaterial.title }}</h2>
          <p>{{ selectedMaterial.summary || selectedMaterial.content || '暂无内容' }}</p>
          <dl class="detail-list">
            <div>
              <dt>来源</dt>
              <dd>{{ materialSourceLabel(selectedMaterial) }}</dd>
            </div>
            <div>
              <dt>绑定状态</dt>
              <dd>{{ bindingStatusLabel(selectedMaterial) }}</dd>
            </div>
            <div>
              <dt>来源作品</dt>
              <dd>{{ sourceBookName(selectedMaterial) }}</dd>
            </div>
            <div>
              <dt>当前用途</dt>
              <dd>{{ usageLabel(selectedMaterial) }}</dd>
            </div>
          </dl>
          <div class="detail-actions">
            <el-button v-motion-feedback type="primary" @click="openBindDialog(selectedMaterial)"
              >绑定到作品</el-button
            >
            <el-button v-motion-feedback @click="openMaterialDialog(selectedMaterial)"
              >编辑</el-button
            >
            <el-button
              v-motion-feedback
              @click="convertMaterial(selectedMaterial, 'character_setting')"
              >转成角色设定</el-button
            >
            <el-button v-motion-feedback @click="convertMaterial(selectedMaterial, 'world_setting')"
              >转成世界观</el-button
            >
            <el-button v-motion-feedback @click="archiveMaterial(selectedMaterial)">删除</el-button>
          </div>
        </template>
        <el-empty v-else description="选择素材后在这里整理和绑定" />
      </aside>
    </section>

    <section v-else-if="activeSection === 'images'" class="manager-grid images-grid" @dragover.prevent="handleImageDragOver" @dragleave.prevent="handleImageDragLeave" @drop.prevent="handleImageDrop">
      <!-- Drag upload overlay -->
      <div v-if="isDraggingImage" class="image-drag-overlay">
        <div class="overlay-content">
          <UploadCloud :size="48" />
          <h3>释放以导入图片到图库</h3>
          <p>支持 PNG, JPG, JPEG, WEBP 等常见格式</p>
        </div>
      </div>
      <aside class="side-filter card-panel">
        <button
          v-for="item in imageFilters"
          :key="item.key"
          type="button"
          :class="{ active: imageFilter === item.key }"
          @click="imageFilter = item.key"
        >
          <span>{{ item.label }}</span>
          <b>{{ imageCount(item.key) }}</b>
        </button>
      </aside>

      <main class="list-panel card-panel">
        <div class="panel-toolbar">
          <el-input v-model="keyword" clearable placeholder="搜索图片名称、所属作品、用途或路径">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button v-motion-feedback type="primary" @click="handleUploadImage"
            >上传图片</el-button
          >
        </div>
        <div v-if="imagesLoadError" class="read-error-card">
          <strong>图片读取失败</strong>
          <span>{{ imagesLoadError }}</span>
          <button v-motion-feedback type="button" @click="loadLibrary">重试</button>
        </div>
        <div
          v-else-if="filteredImages.length"
          v-motion-list="{ selector: '.image-card', key: imageListMotionKey }"
          class="image-board"
        >
          <article
            v-for="asset in pagedImages"
            :key="asset.id"
            class="image-card"
            :class="{ selected: selectedImage?.id === asset.id }"
            @click="selectedImageId = asset.id"
            @dblclick="openImageLightbox(asset)"
          >
            <div class="image-preview">
              <img v-if="asset.isImage" :src="assetUrl(asset)" :alt="asset.name" loading="lazy" />
              <FileImage v-else :size="34" />
              <!-- Quick actions overlay -->
              <div class="image-actions-overlay">
                <button type="button" class="action-btn" title="查看大图" @click.stop="openImageLightbox(asset)">
                  <Eye :size="16" />
                </button>
                <button type="button" class="action-btn" title="下载图片" @click.stop="downloadImage(asset)">
                  <Download :size="16" />
                </button>
                <button type="button" class="action-btn delete" title="删除图片" @click.stop="deleteImage(asset)">
                  <Trash2 :size="16" />
                </button>
              </div>
            </div>
            <h3>{{ asset.name }}</h3>
            <p>{{ asset.bookName || '未绑定作品' }} · {{ imageTypeLabel(asset) }}</p>
          </article>
        </div>
        <div
          v-if="shouldShowPagination('images', filteredImages.length)"
          class="library-pagination"
        >
          <span>{{ paginationSummary('images', filteredImages.length) }}</span>
          <el-pagination
            layout="prev, pager, next, sizes, total"
            :total="filteredImages.length"
            :current-page="listPage.images"
            :page-size="listPageSize.images"
            :page-sizes="libraryPageSizes"
            @current-change="setListPage('images', $event)"
            @size-change="handleListPageSizeChange('images', $event)"
          />
        </div>
        <div v-else-if="!filteredImages.length" class="soft-empty">
          <strong>暂无图片</strong>
          <span>封面、角色图、场景图、地图、参考图和 AI 生成图片会显示在这里。</span>
        </div>
      </main>

      <aside class="detail-card card-panel">
        <template v-if="selectedImage">
          <div class="large-image-preview">
            <img
              v-if="selectedImage.isImage"
              :src="assetUrl(selectedImage)"
              :alt="selectedImage.name"
            />
            <FileImage v-else :size="42" />
          </div>
          <h2>{{ selectedImage.name }}</h2>
          <dl class="detail-list">
            <div>
              <dt>所属作品</dt>
              <dd>{{ selectedImage.bookName || '未绑定' }}</dd>
            </div>
            <div>
              <dt>用途</dt>
              <dd>{{ imageTypeLabel(selectedImage) }}</dd>
            </div>
            <div>
              <dt>生成时间</dt>
              <dd>{{ formatDate(selectedImage.mtime || selectedImage.createdAt) }}</dd>
            </div>
            <div>
              <dt>路径</dt>
              <dd :title="selectedImage.relativePath">{{ selectedImage.relativePath || '-' }}</dd>
            </div>
          </dl>
          <div class="detail-actions">
            <el-button v-motion-feedback type="primary" @click="openImageBindDialog(selectedImage)"
              >绑定到作品</el-button
            >
            <el-button v-motion-feedback @click="openImageBindDialog(selectedImage, 'cover')"
              >设为封面</el-button
            >
            <el-button v-motion-feedback @click="downloadImage(selectedImage)">下载</el-button>
            <el-button v-motion-feedback type="danger" plain @click="deleteImage(selectedImage)"
              >删除</el-button
            >
          </div>
        </template>
        <el-empty v-else description="选择图片后在这里查看和绑定" />
      </aside>
    </section>

    <section v-else-if="activeSection === 'prompts'" class="manager-grid prompt-grid-page">
      <aside class="side-filter card-panel">
        <button
          v-for="item in promptFilters"
          :key="item.key"
          type="button"
          :class="{ active: promptFilter === item.key }"
          @click="promptFilter = item.key"
        >
          <span>{{ item.label }}</span>
          <b>{{ promptCount(item.key) }}</b>
        </button>
      </aside>

      <main class="list-panel card-panel">
        <div class="panel-toolbar">
          <el-input v-model="keyword" clearable placeholder="搜索提示词标题、分类或内容">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button v-motion-feedback type="primary" @click="openPromptDialog()"
            >新增提示词</el-button
          >
        </div>
        <div v-if="promptsLoadError" class="read-error-card">
          <strong>提示词读取失败</strong>
          <span>{{ promptsLoadError }}</span>
          <button v-motion-feedback type="button" @click="loadLibrary">重试</button>
        </div>
        <div
          v-else-if="filteredPrompts.length"
          v-motion-list="{ selector: '.prompt-row', key: promptListMotionKey }"
          class="prompt-list"
        >
          <article
            v-for="preset in pagedPrompts"
            :key="preset.id"
            class="prompt-row"
            :class="{ selected: selectedPrompt?.id === preset.id }"
            @click="selectedPromptId = preset.id"
          >
            <span class="type-pill">{{ promptCategoryLabel(preset.category) }}</span>
            <h3>{{ preset.name || '未命名提示词' }}</h3>
            <p>{{ preset.systemPrompt || preset.userPromptTemplate || '暂无内容' }}</p>
            <div class="meta-line">
              <span>{{ preset.isBuiltin ? '内置' : '自定义' }}</span>
              <span>{{ promptScopeText(preset) }}</span>
              <span>{{ formatDate(preset.updatedAt || preset.createdAt) }}</span>
            </div>
          </article>
        </div>
        <div
          v-if="shouldShowPagination('prompts', filteredPrompts.length)"
          class="library-pagination"
        >
          <span>{{ paginationSummary('prompts', filteredPrompts.length) }}</span>
          <el-pagination
            layout="prev, pager, next, sizes, total"
            :total="filteredPrompts.length"
            :current-page="listPage.prompts"
            :page-size="listPageSize.prompts"
            :page-sizes="libraryPageSizes"
            @current-change="setListPage('prompts', $event)"
            @size-change="handleListPageSizeChange('prompts', $event)"
          />
        </div>
        <div v-else-if="!filteredPrompts.length" class="soft-empty">
          <strong>暂无提示词</strong>
          <span>写作、拆书、图片生成、续写、改写、大纲和世界观提示词会显示在这里。</span>
          <button v-motion-feedback type="button" @click="openPromptDialog()">新增提示词</button>
        </div>
      </main>

      <aside class="detail-card card-panel prompt-editor-card">
        <template v-if="selectedPrompt">
          <span class="type-pill">{{ promptCategoryLabel(selectedPrompt.category) }}</span>
          <h2>{{ selectedPrompt.name }}</h2>
          <label>
            <span>系统指令</span>
            <textarea readonly :value="selectedPrompt.systemPrompt || ''"></textarea>
          </label>
          <label>
            <span>Prompt 内容</span>
            <textarea readonly :value="selectedPrompt.userPromptTemplate || ''"></textarea>
          </label>
          <dl class="detail-list">
            <div>
              <dt>适用范围</dt>
              <dd>{{ promptScopeText(selectedPrompt) }}</dd>
            </div>
            <div>
              <dt>模型参数</dt>
              <dd>{{ promptParamsText(selectedPrompt) }}</dd>
            </div>
            <div>
              <dt>最近使用</dt>
              <dd>{{ formatDate(selectedPrompt.lastUsedAt) }}</dd>
            </div>
          </dl>
          <div class="detail-actions">
            <el-button v-motion-feedback type="primary" @click="usePrompt(selectedPrompt)"
              >使用</el-button
            >
            <el-button v-motion-feedback @click="openPromptDialog(selectedPrompt)">编辑</el-button>
            <el-button v-motion-feedback @click="duplicatePrompt(selectedPrompt)">复制</el-button>
            <el-button v-motion-feedback @click="openPromptBindDialog(selectedPrompt)"
              >绑定到作品</el-button
            >
            <el-button
              v-if="!selectedPrompt.isBuiltin"
              v-motion-feedback
              type="danger"
              plain
              @click="deletePrompt(selectedPrompt)"
              >删除</el-button
            >
          </div>
        </template>
        <el-empty v-else description="选择提示词后在这里查看内容和使用记录" />
      </aside>
    </section>

    <section v-else class="manager-grid trash-grid">
      <aside class="side-filter card-panel">
        <button
          v-for="item in trashFilters"
          :key="item.key"
          type="button"
          :class="{ active: trashFilter === item.key }"
          @click="trashFilter = item.key"
        >
          <span>{{ item.label }}</span>
          <b>{{ trashCount(item.key) }}</b>
        </button>
      </aside>

      <main class="list-panel card-panel">
        <div class="panel-toolbar">
          <el-input v-model="keyword" clearable placeholder="搜索删除项名称、类型或所属作品">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
        <div v-if="trashLoadError" class="read-error-card">
          <strong>回收站读取失败</strong>
          <span>{{ trashLoadError }}</span>
          <button v-motion-feedback type="button" @click="loadLibrary">重试</button>
        </div>
        <div
          v-else-if="filteredTrash.length"
          v-motion-list="{ selector: '.trash-row', key: trashListMotionKey }"
          class="trash-list"
        >
          <article
            v-for="item in pagedTrash"
            :key="item.key"
            class="trash-row"
            :class="{ selected: selectedTrash?.key === item.key }"
            @click="selectedTrashKey = item.key"
          >
            <span class="type-pill">{{ item.typeLabel }}</span>
            <h3>{{ item.title }}</h3>
            <p>
              {{ item.owner || '未记录所属作品' }} ·
              {{ formatDate(item.deletedAt || item.updatedAt) }}
            </p>
          </article>
        </div>
        <div v-if="shouldShowPagination('trash', filteredTrash.length)" class="library-pagination">
          <span>{{ paginationSummary('trash', filteredTrash.length) }}</span>
          <el-pagination
            layout="prev, pager, next, sizes, total"
            :total="filteredTrash.length"
            :current-page="listPage.trash"
            :page-size="listPageSize.trash"
            :page-sizes="libraryPageSizes"
            @current-change="setListPage('trash', $event)"
            @size-change="handleListPageSizeChange('trash', $event)"
          />
        </div>
        <div v-else-if="!filteredTrash.length" class="soft-empty">
          <strong>回收站是空的</strong>
          <span>被移除的作品、素材、图片、提示词和拆书资产会显示在这里。</span>
        </div>
      </main>

      <aside class="detail-card card-panel">
        <template v-if="selectedTrash">
          <span class="type-pill">{{ selectedTrash.typeLabel }}</span>
          <h2>{{ selectedTrash.title }}</h2>
          <dl class="detail-list">
            <div>
              <dt>所属作品</dt>
              <dd>{{ selectedTrash.owner || '-' }}</dd>
            </div>
            <div>
              <dt>删除时间</dt>
              <dd>{{ formatDate(selectedTrash.deletedAt || selectedTrash.updatedAt) }}</dd>
            </div>
            <div>
              <dt>删除来源</dt>
              <dd>{{ selectedTrash.source || '创作库' }}</dd>
            </div>
            <div>
              <dt>是否可恢复</dt>
              <dd>{{ selectedTrash.restorable ? '可恢复' : '不可恢复' }}</dd>
            </div>
          </dl>
          <p>{{ selectedTrash.summary || '暂无详情' }}</p>
          <div class="detail-actions">
            <el-button
              v-motion-feedback
              type="success"
              :disabled="!selectedTrash.restorable"
              @click="restoreTrashItem(selectedTrash)"
              >恢复</el-button
            >
            <el-button v-motion-feedback type="danger" plain @click="deleteTrashItem(selectedTrash)"
              >永久删除</el-button
            >
          </div>
        </template>
        <el-empty v-else description="选择删除项查看详情" />
      </aside>
    </section>

    <el-dialog
      v-model="showMaterialDialog"
      :title="materialForm.id ? '编辑素材' : '新增素材'"
      width="560px"
    >
      <el-form label-position="top">
        <el-form-item label="标题">
          <el-input v-model="materialForm.title" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="materialForm.type" style="width: 100%">
            <el-option label="灵感卡" value="topic_card" />
            <el-option label="摘录片段" value="note" />
            <el-option label="拆书片段" value="book_analysis" />
            <el-option label="待整理设定" value="world_setting" />
            <el-option label="创作台提取" value="plot_fragment" />
          </el-select>
        </el-form-item>
        <el-form-item label="摘要">
          <el-input v-model="materialForm.summary" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="materialForm.content" type="textarea" :rows="5" />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="materialForm.tagsText" placeholder="用逗号分隔" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showMaterialDialog = false">取消</el-button>
        <el-button type="primary" :loading="savingMaterial" @click="saveMaterial">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showBindDialog" title="绑定素材到作品" width="460px">
      <el-form label-position="top">
        <el-form-item label="选择作品">
          <el-select v-model="bindForm.bookId" filterable style="width: 100%">
            <el-option
              v-for="book in books"
              :key="bookKey(book)"
              :label="bookTitle(book)"
              :value="bookKey(book)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="资产类型">
          <el-select v-model="bindForm.assetType" style="width: 100%">
            <el-option label="章节灵感" value="chapter_inspiration" />
            <el-option label="角色" value="character_setting" />
            <el-option label="世界观" value="world_setting" />
            <el-option label="设定集" value="setting" />
            <el-option label="伏笔" value="foreshadowing" />
            <el-option label="图片参考" value="image_reference" />
            <el-option label="提示词" value="prompt_template" />
          </el-select>
        </el-form-item>
        <el-form-item label="添加标签">
          <el-input v-model="bindForm.tagsText" placeholder="用逗号分隔" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBindDialog = false">取消</el-button>
        <el-button type="primary" @click="saveMaterialBinding">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showImageBindDialog" title="绑定图片" width="460px">
      <el-form label-position="top">
        <el-form-item label="目标作品">
          <el-select v-model="imageBindForm.bookName" filterable style="width: 100%">
            <el-option
              v-for="book in books"
              :key="bookKey(book)"
              :label="bookTitle(book)"
              :value="book.folderName || book.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="用途">
          <el-select v-model="imageBindForm.type" style="width: 100%">
            <el-option label="封面" value="cover" />
            <el-option label="角色图" value="character" />
            <el-option label="场景图" value="scene" />
            <el-option label="地图" value="map" />
            <el-option label="参考图" value="attachment" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showImageBindDialog = false">取消</el-button>
        <el-button type="primary" @click="saveImageBinding">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showPromptDialog"
      :title="promptForm.id ? '编辑提示词' : '新增提示词'"
      width="620px"
    >
      <el-form label-position="top">
        <el-form-item label="标题">
          <el-input v-model="promptForm.name" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="promptForm.category" style="width: 100%">
            <el-option
              v-for="item in promptFilters.filter((row) => row.key !== 'all')"
              :key="item.key"
              :label="item.label"
              :value="item.key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="适用范围">
          <el-radio-group v-model="promptForm.scope">
            <el-radio-button label="global">全局</el-radio-button>
            <el-radio-button label="book">单本书</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="promptForm.scope === 'book'" label="选择作品">
          <el-select v-model="promptForm.bookId" filterable style="width: 100%">
            <el-option
              v-for="book in books"
              :key="bookKey(book)"
              :label="bookTitle(book)"
              :value="bookKey(book)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="系统指令">
          <el-input v-model="promptForm.systemPrompt" type="textarea" :rows="5" />
        </el-form-item>
        <el-form-item label="Prompt 内容">
          <el-input v-model="promptForm.userPromptTemplate" type="textarea" :rows="6" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPromptDialog = false">取消</el-button>
        <el-button type="primary" @click="savePrompt">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showPromptBindDialog" title="绑定提示词到作品" width="460px">
      <el-form label-position="top">
        <el-form-item label="选择作品">
          <el-select v-model="promptBindForm.bookId" filterable style="width: 100%">
            <el-option
              v-for="book in books"
              :key="bookKey(book)"
              :label="bookTitle(book)"
              :value="bookKey(book)"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPromptBindDialog = false">取消</el-button>
        <el-button type="primary" @click="savePromptBinding">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加书籍弹窗 -->
    <el-dialog
      v-model="addBookDialogVisible"
      title="添加书籍"
      width="700px"
      destroy-on-close
      align-center
    >
      <el-tabs v-model="activeImportTab" class="add-book-tabs">
        <el-tab-pane label="服务器书源" name="server">
          <NovelImportPanel ref="novelImportRef" @imported="handleNovelImported" />
        </el-tab-pane>
        <el-tab-pane label="本地文件导入" name="local">
          <LocalBookImportPanel ref="localBookImportRef" @imported="handleLocalBookImported" />
        </el-tab-pane>
      </el-tabs>
    </el-dialog>

    <!-- 图片大图预览弹窗 -->
    <el-dialog v-model="imagePreviewVisible" title="图片预览" width="800px" destroy-on-close align-center popper-class="image-lightbox-dialog">
      <div class="lightbox-wrapper">
        <div class="lightbox-image-container">
          <img :src="previewImageUrl" :alt="previewImageName" />
        </div>
        <div class="lightbox-meta">
          <div>
            <h3>{{ previewImageName }}</h3>
            <p v-if="previewImageBook">所属作品: {{ previewImageBook }}</p>
          </div>
          <div class="lightbox-actions">
            <el-button v-motion-feedback type="primary" @click="downloadImage(previewImageAsset)">下载原图</el-button>
            <el-button v-motion-feedback @click="imagePreviewVisible = false">关闭</el-button>
          </div>
        </div>
      </div>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import {
  Archive,
  BookOpen,
  Bookmark,
  Download,
  FileImage,
  FileText,
  Search as SearchIcon,
  SlidersHorizontal,
  Trash2,
  Plus,
  Eye,
  UploadCloud
} from 'lucide-vue-next'
import LocalBookImportPanel from '@renderer/components/LocalBookImportPanel.vue'
import NovelImportPanel from '@renderer/components/NovelImportPanel.vue'
import { useMainStore } from '@renderer/stores'
import { deleteBook, readBooksDir } from '@renderer/service/books'
import { listChapterTree } from '@renderer/service/editor'
import {
  attachAssetToBook,
  deleteAsset,
  getAssetUrl,
  imageSelectionToImportInput,
  importAsset,
  listAssets,
  restoreAsset
} from '@renderer/service/assets'
import {
  createPromptPreset,
  deletePromptPreset,
  listPromptPresets,
  updatePromptPreset
} from '@renderer/service/aiWorkshop'
import {
  archiveKnowledgeItem,
  createKnowledgeItem,
  deleteKnowledgeItem,
  listKnowledgeItems,
  updateKnowledgeItem
} from '@renderer/service/knowledgeBase'

const props = defineProps({
  section: {
    type: String,
    default: ''
  }
})

const route = useRoute()
const router = useRouter()
const mainStore = useMainStore()

const loading = ref(false)
const isDraggingImage = ref(false)
const imagePreviewVisible = ref(false)
const previewImageUrl = ref('')
const previewImageName = ref('')
const previewImageBook = ref('')
const previewImageId = ref('')
const previewImageAsset = ref(null)
const keyword = ref('')
const searchMode = ref('shelf')
const bookFilter = ref('all')
const materialFilter = ref('all')
const materialBookKey = ref('')
const imageFilter = ref('all')
const promptFilter = ref('all')
const trashFilter = ref('all')
const libraryPageSizes = [12, 24, 48, 96]
const listPage = reactive({
  books: 1,
  materials: 1,
  images: 1,
  prompts: 1,
  trash: 1
})
const listPageSize = reactive({
  books: 12,
  materials: 12,
  images: 24,
  prompts: 12,
  trash: 12
})
const selectedBookKey = ref('')
const selectedBookKeys = ref([])
const selectedMaterialId = ref('')
const selectedMaterialIds = ref([])
const selectedImageId = ref('')
const selectedPromptId = ref('')
const selectedTrashKey = ref('')
const deletingBookKey = ref('')
const assetItems = ref([])
const promptPresets = ref([])
const knowledgeItems = ref([])
const libraryLoadErrors = reactive({
  books: '',
  assets: '',
  prompts: '',
  knowledge: ''
})
const chapterCountMap = ref({})
const wordCountMap = ref({})
const novelImportRef = ref(null)
const localBookImportRef = ref(null)
const addBookDialogVisible = ref(false)
const activeImportTab = ref('server')
const toolbarSourceId = computed({
  get: () => novelImportRef.value?.currentSourceId || '',
  set: (value) => {
    if (novelImportRef.value) {
      novelImportRef.value.currentSourceId = value
    }
  }
})

const showMaterialDialog = ref(false)
const showBindDialog = ref(false)
const showImageBindDialog = ref(false)
const showPromptDialog = ref(false)
const showPromptBindDialog = ref(false)
const savingMaterial = ref(false)
const batchDeletingMaterials = ref(false)
const activeMaterialForBinding = ref(null)
const activeImageForBinding = ref(null)
const activePromptForBinding = ref(null)

const materialForm = reactive({
  id: '',
  title: '',
  type: 'note',
  summary: '',
  content: '',
  tagsText: ''
})

const bindForm = reactive({
  bookId: '',
  assetType: 'chapter_inspiration',
  tagsText: ''
})

const imageBindForm = reactive({
  id: '',
  bookName: '',
  type: 'attachment'
})

const promptForm = reactive({
  id: '',
  name: '',
  category: 'writing',
  scope: 'global',
  bookId: '',
  originalScopeKey: '',
  sourcePresetId: '',
  isBuiltin: false,
  systemPrompt: '',
  userPromptTemplate: ''
})

const promptBindForm = reactive({
  bookId: ''
})

const sectionMeta = {
  bookshelf: {
    title: '创作库 · 作品书架',
    description: '管理你的小说作品、下载书籍、参考资料与创作素材。'
  },
  materials: {
    title: '创作库 · 素材箱',
    description: '收纳还没绑定到具体作品的灵感、摘录、拆书片段和待整理资料。'
  },
  images: {
    title: '创作库 · 图库',
    description: '管理封面、角色图、场景图、地图、参考图和 AI 生成图片。'
  },
  prompts: {
    title: '创作库 · 提示词',
    description: '管理写作、拆书、图片生成、续写、改写、大纲和世界观提示词。'
  },
  trash: {
    title: '创作库 · 回收站',
    description: '恢复或彻底删除已移除的作品、素材、图片、提示词和拆书资产。'
  }
}

const bookFilters = [
  { key: 'all', label: '全部' },
  { key: 'creative', label: '我的作品' },
  { key: 'downloaded', label: '下载书籍' },
  { key: 'imported', label: '导入书籍' },
  { key: 'reference', label: '参考资料' },
  { key: 'unfiled', label: '未归档' }
]

const materialFilters = [
  { key: 'all', label: '全部' },
  { key: 'topic_card', label: '灵感卡' },
  { key: 'note', label: '摘录片段' },
  { key: 'book_analysis', label: '拆书片段' },
  { key: 'world_setting', label: '待整理设定' },
  { key: 'market', label: '市场灵感' },
  { key: 'plot_fragment', label: '创作台提取' },
  { key: 'imported', label: '上传资料' },
  { key: 'unbound', label: '未绑定' }
]

const imageFilters = [
  { key: 'all', label: '全部' },
  { key: 'cover', label: '封面' },
  { key: 'character', label: '角色图' },
  { key: 'scene', label: '场景图' },
  { key: 'map', label: '地图' },
  { key: 'prop', label: '道具图' },
  { key: 'atmosphere', label: '氛围图' },
  { key: 'poster', label: '宣传图' },
  { key: 'reference', label: '参考图' },
  { key: 'unbound', label: '未绑定' }
]

const promptFilters = [
  { key: 'all', label: '全部' },
  { key: 'writing', label: '写作' },
  { key: 'continueWrite', label: '续写' },
  { key: 'rewrite', label: '改写' },
  { key: 'polish', label: '润色' },
  { key: 'deconstruct', label: '拆书' },
  { key: 'outline', label: '大纲' },
  { key: 'character', label: '角色' },
  { key: 'world', label: '世界观' },
  { key: 'image', label: '图片生成' },
  { key: 'market', label: '市场灵感' },
  { key: 'custom', label: '自定义' }
]

const trashFilters = [
  { key: 'all', label: '全部' },
  { key: 'book', label: '作品' },
  { key: 'material', label: '素材' },
  { key: 'image', label: '图片' },
  { key: 'prompt', label: '提示词' },
  { key: 'book_analysis', label: '拆书资产' },
  { key: 'chapter', label: '章节' },
  { key: 'character', label: '角色' },
  { key: 'world', label: '世界观' }
]

const librarySectionLinks = [
  { key: 'bookshelf', label: '作品书架', path: '/knowledge', icon: BookOpen },
  { key: 'materials', label: '素材箱', path: '/knowledge/materials', icon: FileText },
  { key: 'images', label: '图库', path: '/knowledge/images', icon: FileImage },
  { key: 'prompts', label: '提示词', path: '/knowledge/prompts', icon: Bookmark },
  { key: 'trash', label: '回收站', path: '/knowledge/trash', icon: Trash2 }
]

const activeSection = computed(() => {
  if (props.section) return props.section
  const path = route.path
  if (path.endsWith('/materials')) return 'materials'
  if (path.endsWith('/images')) return 'images'
  if (path.endsWith('/prompts')) return 'prompts'
  if (path.endsWith('/trash')) return 'trash'
  return 'bookshelf'
})

const pageMeta = computed(() => sectionMeta[activeSection.value] || sectionMeta.bookshelf)
const books = computed(() => mainStore.books || [])
const materialsLoadError = computed(() => libraryLoadErrors.knowledge)
const imagesLoadError = computed(() => libraryLoadErrors.assets)
const promptsLoadError = computed(() => libraryLoadErrors.prompts)
const trashLoadError = computed(() =>
  [libraryLoadErrors.knowledge, libraryLoadErrors.assets].filter(Boolean).join('；')
)
const novelSources = computed(() => novelImportRef.value?.sources || [])
const novelSearching = computed(() => Boolean(novelImportRef.value?.searching))
const searchPlaceholder = computed(() => {
  if (searchMode.value === 'source') return '搜索网络小说书名或作者，回车导入书架'
  if (searchMode.value === 'local') return '选择 TXT、MD、DOCX 后加入书架'
  return '搜索书架里的作品、角色、设定、图片、提示词'
})
const searchActionLabel = computed(() => {
  if (searchMode.value === 'source') return '搜索'
  if (searchMode.value === 'local') return '选择文件'
  return '搜书源'
})
const currentBookFilterLabel = computed(
  () => bookFilters.find((item) => item.key === bookFilter.value)?.label || '筛选'
)
const materialBookFilterBook = computed(() => findBookByKey(materialBookKey.value))
const materialBookFilterLabel = computed(() => {
  const book = materialBookFilterBook.value
  return book ? bookTitle(book) : String(materialBookKey.value || '').trim()
})

const selectedBook = computed(
  () => books.value.find((book) => bookKey(book) === selectedBookKey.value) || null
)
const selectedMaterial = computed(
  () =>
    filteredMaterials.value.find((item) => item.id === selectedMaterialId.value) ||
    pagedMaterials.value[0] ||
    null
)
const selectedImage = computed(
  () =>
    filteredImages.value.find((item) => item.id === selectedImageId.value) ||
    pagedImages.value[0] ||
    null
)
const selectedPrompt = computed(
  () =>
    filteredPrompts.value.find((item) => item.id === selectedPromptId.value) ||
    pagedPrompts.value[0] ||
    null
)
const selectedTrash = computed(
  () =>
    filteredTrash.value.find((item) => item.key === selectedTrashKey.value) ||
    pagedTrash.value[0] ||
    null
)

const filteredBooks = computed(() => {
  const q = normalizedKeyword()
  return [...books.value]
    .filter((book) => matchesBookFilter(book))
    .filter((book) => !q || bookSearchText(book).includes(q))
    .sort((a, b) => dateValue(bookUpdatedAt(b)) - dateValue(bookUpdatedAt(a)))
})

const materialItems = computed(() =>
  knowledgeItems.value.filter((item) => item.status !== 'discarded' && item.status !== 'archived')
)

const filteredMaterials = computed(() => {
  const q = normalizedKeyword()
  return materialItems.value
    .filter((item) => matchesMaterialFilter(item))
    .filter((item) => matchesMaterialBookFilter(item))
    .filter((item) => !q || materialSearchText(item).includes(q))
    .sort((a, b) => dateValue(b.updatedAt || b.createdAt) - dateValue(a.updatedAt || a.createdAt))
})

const imageItems = computed(() => assetItems.value.filter((asset) => asset.status !== 'trash'))

const filteredImages = computed(() => {
  const q = normalizedKeyword()
  return imageItems.value
    .filter((asset) => matchesImageFilter(asset))
    .filter((asset) => !q || imageSearchText(asset).includes(q))
    .sort((a, b) => dateValue(b.mtime || b.createdAt) - dateValue(a.mtime || a.createdAt))
})

const filteredPrompts = computed(() => {
  const q = normalizedKeyword()
  return promptPresets.value
    .filter((preset) => matchesPromptFilter(preset))
    .filter((preset) => !q || promptSearchText(preset).includes(q))
    .sort((a, b) => dateValue(b.updatedAt || b.createdAt) - dateValue(a.updatedAt || a.createdAt))
})

const trashRows = computed(() => [
  ...knowledgeItems.value
    .filter((item) => item.status === 'discarded' || item.status === 'archived')
    .map((item) => ({
      key: `material:${item.id}`,
      raw: item,
      kind: materialTrashKind(item),
      typeLabel: materialTypeLabel(item),
      title: item.title || '未命名素材',
      owner: sourceBookName(item),
      summary: item.summary || item.content || '',
      source: item.sourceType || '创作库',
      deletedAt: item.updatedAt || item.createdAt,
      updatedAt: item.updatedAt,
      restorable: true
    })),
  ...assetItems.value
    .filter((asset) => asset.status === 'trash')
    .map((asset) => ({
      key: `image:${asset.id}`,
      raw: asset,
      kind: 'image',
      typeLabel: '图片',
      title: asset.name || '未命名图片',
      owner: asset.bookName || asset.bookFolderName || '',
      summary: asset.relativePath || '',
      source: asset.source || '图库',
      deletedAt: asset.deletedAt || asset.mtime,
      updatedAt: asset.deletedAt || asset.mtime,
      restorable: true
    }))
])

const filteredTrash = computed(() => {
  const q = normalizedKeyword()
  return trashRows.value
    .filter((item) => trashFilter.value === 'all' || item.kind === trashFilter.value)
    .filter(
      (item) =>
        !q ||
        [item.title, item.typeLabel, item.owner, item.summary].join(' ').toLowerCase().includes(q)
    )
    .sort((a, b) => dateValue(b.deletedAt || b.updatedAt) - dateValue(a.deletedAt || a.updatedAt))
})

const pagedBooks = computed(() => paginateRows(filteredBooks.value, 'books'))
const pagedMaterials = computed(() => paginateRows(filteredMaterials.value, 'materials'))
const pagedImages = computed(() => paginateRows(filteredImages.value, 'images'))
const pagedPrompts = computed(() => paginateRows(filteredPrompts.value, 'prompts'))
const pagedTrash = computed(() => paginateRows(filteredTrash.value, 'trash'))
const bookListMotionKey = computed(() =>
  rowsMotionKey(
    'books',
    pagedBooks.value.map((book) => bookKey(book))
  )
)
const materialListMotionKey = computed(() =>
  rowsMotionKey(
    'materials',
    pagedMaterials.value.map((item) => item.id)
  )
)
const imageListMotionKey = computed(() =>
  rowsMotionKey(
    'images',
    pagedImages.value.map((asset) => asset.id)
  )
)
const promptListMotionKey = computed(() =>
  rowsMotionKey(
    'prompts',
    pagedPrompts.value.map((preset) => preset.id)
  )
)
const trashListMotionKey = computed(() =>
  rowsMotionKey(
    'trash',
    pagedTrash.value.map((item) => item.key)
  )
)

watch(activeSection, (section) => {
  if (section === 'materials' && hasMaterialRouteFocus()) {
    applyMaterialRouteFocus()
  } else {
    keyword.value = ''
    if (section !== 'materials') {
      materialBookKey.value = ''
    }
  }
  resetListPage(sectionPageKey())
})

watch(
  () => [activeSection.value, route.query.q, route.query.bookId, route.query.name],
  () => {
    if (activeSection.value !== 'materials') return
    if (hasMaterialRouteFocus()) {
      applyMaterialRouteFocus()
    } else {
      materialBookKey.value = ''
    }
  },
  { immediate: true }
)

watch(
  () => route.query.import,
  (value) => {
    if (activeSection.value === 'bookshelf' && value === 'novel') {
      searchMode.value = 'source'
      scrollToNovelImport()
    } else if (activeSection.value === 'bookshelf' && value === 'local') {
      searchMode.value = 'local'
      scrollToNovelImport()
    }
  },
  { immediate: true }
)

watch(searchMode, (mode) => {
  if (mode === 'source') {
    syncNovelKeyword()
  }
})

watch(keyword, (value) => {
  if (searchMode.value === 'source') {
    novelImportRef.value?.setKeyword(value)
  }
  resetListPage(sectionPageKey())
})

watch(filteredBooks, (rows) => {
  clampListPage('books', rows.length)
  const visibleKeys = new Set(rows.map((book) => bookKey(book)))
  selectedBookKeys.value = selectedBookKeys.value.filter((key) => visibleKeys.has(key))
  if (!rows.length) selectedBookKey.value = ''
  else if (selectedBookKey.value && !rows.some((book) => bookKey(book) === selectedBookKey.value)) {
    selectedBookKey.value = ''
  }
})

watch(filteredMaterials, (rows) => {
  clampListPage('materials', rows.length)
  const visibleIds = new Set(rows.map((item) => item.id))
  selectedMaterialIds.value = selectedMaterialIds.value.filter((id) => visibleIds.has(id))
  if (selectedMaterialId.value && !visibleIds.has(selectedMaterialId.value)) {
    selectedMaterialId.value = ''
  }
})

watch(filteredImages, (rows) => {
  clampListPage('images', rows.length)
})

watch(filteredPrompts, (rows) => {
  clampListPage('prompts', rows.length)
})

watch(filteredTrash, (rows) => {
  clampListPage('trash', rows.length)
})

watch(bookFilter, () => resetListPage('books'))
watch(materialFilter, () => resetListPage('materials'))
watch(imageFilter, () => resetListPage('images'))
watch(promptFilter, () => resetListPage('prompts'))
watch(trashFilter, () => resetListPage('trash'))

onMounted(loadLibrary)

async function loadLibrary() {
  loading.value = true
  try {
    const [bookResult, assetResult, promptResult, knowledgeResult] = await Promise.allSettled([
      readBooksDir(),
      listAssets({ includeTrash: true }),
      listPromptPresets({ includeAllBookPresets: true }),
      listKnowledgeItems({ sortBy: 'updatedAt' })
    ])
    if (bookResult.status === 'fulfilled') {
      try {
        await loadChapterCounts(bookResult.value || [])
        libraryLoadErrors.books = ''
      } catch (error) {
        libraryLoadErrors.books = libraryLoadMessage(error, '读取章节统计失败')
        chapterCountMap.value = {}
        wordCountMap.value = {}
      }
    } else {
      libraryLoadErrors.books = libraryLoadMessage(bookResult.reason, '读取书架失败')
      mainStore.setBooks([])
      chapterCountMap.value = {}
      wordCountMap.value = {}
      selectedBookKey.value = ''
    }
    applyLibraryRows(assetResult, {
      normalize: normalizeAssetRows,
      fallback: '读取图片失败',
      setRows: (rows) => {
        assetItems.value = rows
      },
      clearSelection: () => {
        selectedImageId.value = ''
      },
      setError: (message) => {
        libraryLoadErrors.assets = message
      }
    })
    applyLibraryRows(promptResult, {
      normalize: normalizePromptRows,
      fallback: '读取提示词失败',
      setRows: (rows) => {
        promptPresets.value = rows
      },
      clearSelection: () => {
        selectedPromptId.value = ''
      },
      setError: (message) => {
        libraryLoadErrors.prompts = message
      }
    })
    applyLibraryRows(knowledgeResult, {
      normalize: normalizeKnowledgeRows,
      fallback: '读取素材失败',
      setRows: (rows) => {
        knowledgeItems.value = rows
      },
      clearSelection: () => {
        selectedMaterialId.value = ''
        selectedMaterialIds.value = []
      },
      setError: (message) => {
        libraryLoadErrors.knowledge = message
      }
    })
  } catch (error) {
    ElMessage.error(error?.message || '加载创作库失败')
  } finally {
    loading.value = false
  }
}

function libraryLoadMessage(error, fallback) {
  return error?.message || fallback
}

function applyLibraryRows(result, { normalize, fallback, setRows, clearSelection, setError }) {
  try {
    if (result.status !== 'fulfilled') throw result.reason
    setRows(normalize(result.value))
    setError('')
  } catch (error) {
    setRows([])
    clearSelection()
    setError(libraryLoadMessage(error, fallback))
  }
}

async function loadChapterCounts(rows) {
  const pairs = await Promise.all(
    rows.map(async (book) => {
      const tree = await listChapterTree(book.folderName || book.name)
      const chapters = flattenChapters(tree || [])
      const words = chapters.reduce(
        (sum, chapter) =>
          sum + Number(chapter.wordCount || chapter.words || chapter.totalWords || 0),
        0
      )
      return [bookKey(book), chapters.length, words]
    })
  )
  chapterCountMap.value = Object.fromEntries(pairs.map(([key, count]) => [key, count]))
  wordCountMap.value = Object.fromEntries(pairs.map(([key, , words]) => [key, words]))
}

function normalizeAssetRows(result) {
  if (result?.success !== true) throw new Error(result?.message || '读取图片失败')
  if (Array.isArray(result.items)) return result.items
  throw new Error('读取图片失败：接口返回格式不正确')
}

function normalizePromptRows(result) {
  if (result?.success !== true) throw new Error(result?.message || '读取提示词失败')
  if (Array.isArray(result.presets)) return result.presets
  throw new Error('读取提示词失败：接口返回格式不正确')
}

function normalizeKnowledgeRows(result) {
  if (result?.success !== true) throw new Error(result?.message || '读取素材失败')
  if (Array.isArray(result.items)) return result.items
  throw new Error('读取素材失败：接口返回格式不正确')
}

function sectionPageKey() {
  return activeSection.value === 'bookshelf' ? 'books' : activeSection.value
}

function paginateRows(rows = [], key) {
  const size = Number(listPageSize[key] || 24)
  const page = Number(listPage[key] || 1)
  const start = (page - 1) * size
  return rows.slice(start, start + size)
}

function rowsMotionKey(scope, keys = []) {
  return `${scope}:${keys.filter(Boolean).join('|')}`
}

function setListPage(key, page) {
  listPage[key] = Number(page) || 1
}

function resetListPage(key) {
  if (key && listPage[key] !== undefined) {
    listPage[key] = 1
  }
}

function handleListPageSizeChange(key, size) {
  listPageSize[key] = Number(size) || 24
  resetListPage(key)
}

function clampListPage(key, total) {
  const size = Number(listPageSize[key] || 24)
  const maxPage = Math.max(1, Math.ceil(Number(total || 0) / size))
  if (listPage[key] > maxPage) {
    listPage[key] = maxPage
  }
}

function paginationSummary(key, total) {
  const size = Number(listPageSize[key] || 24)
  const page = Number(listPage[key] || 1)
  const count = Number(total || 0)
  if (!count) return '暂无结果'
  const start = (page - 1) * size + 1
  const end = Math.min(count, start + size - 1)
  return `当前显示 ${start}-${end}，共 ${count} 条`
}

function shouldShowPagination(key, total) {
  return Number(total || 0) > Number(listPageSize[key] || 24)
}

function openAddBookDialog() {
  addBookDialogVisible.value = true
  activeImportTab.value = 'server'
}

function handleBookshelfDrop(event) {
  const files = Array.from(event.dataTransfer?.files || [])
  const supported = files.filter((f) => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    return ['txt', 'md', 'markdown', 'docx'].includes(ext)
  })
  if (supported.length > 0) {
    addBookDialogVisible.value = true
    activeImportTab.value = 'local'
    nextTick(() => {
      if (localBookImportRef.value) {
        localBookImportRef.value.parseFiles(supported)
      }
    })
  } else {
    ElMessage.warning('拖入文件格式不支持，仅支持 TXT, MD, DOCX 文本格式')
  }
}

async function handleNovelImported(book) {
  addBookDialogVisible.value = false
  bookFilter.value = 'downloaded'
  searchMode.value = 'shelf'
  await loadLibrary()
  if (book?.id || book?.name) {
    selectedBookKey.value = String(book.id || book.name)
  }
}

async function handleLocalBookImported(book) {
  addBookDialogVisible.value = false
  bookFilter.value = 'imported'
  searchMode.value = 'shelf'
  await loadLibrary()
  if (book?.id || book?.name) {
    selectedBookKey.value = String(book.id || book.name)
  }
}

async function handleUnifiedSearch() {
  if (searchMode.value === 'local') {
    await waitForImportPanel()
    localBookImportRef.value?.openFilePicker()
    return
  }
  if (searchMode.value !== 'source') {
    searchMode.value = 'source'
    await waitForImportPanel()
  }
  if (!novelImportRef.value) return
  syncNovelKeyword()
  await novelImportRef.value.handleSearch()
}

function switchSearchMode(mode) {
  searchMode.value = mode
  if (mode === 'source') {
    syncNovelKeyword()
  }
}

function syncNovelKeyword() {
  requestAnimationFrame(() => {
    novelImportRef.value?.setKeyword(keyword.value)
  })
}

function waitForImportPanel() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve)
    })
  })
}

function scrollToNovelImport() {
  setTimeout(() => {
    document
      .querySelector('.bookshelf-import-card')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 80)
}

function selectBook(book) {
  selectedBookKey.value = bookKey(book)
}

function isBookSelected(book) {
  return selectedBookKeys.value.includes(bookKey(book))
}

function toggleBookSelection(book, checked) {
  const key = bookKey(book)
  if (!key) return
  if (checked) {
    selectedBookKeys.value = Array.from(new Set([...selectedBookKeys.value, key]))
  } else {
    selectedBookKeys.value = selectedBookKeys.value.filter((item) => item !== key)
  }
}

function openStudio(book, action = '') {
  const folderName = book.folderName || book.name
  const id = book.id || folderName
  router.push({
    path: `/editor/${encodeURIComponent(id)}`,
    query: {
      name: folderName,
      source: isDownloadedBook(book) ? 'downloaded' : 'book',
      ...(action ? { action } : {})
    }
  })
}

function openAssetStudio(book) {
  router.push(`/knowledge/books/${encodeURIComponent(bookKey(book))}`)
}

function openLibrarySection(item) {
  if (!item?.path || route.path === item.path) return
  router.push(item.path)
}

function openSplitDialog(book) {
  router.push({
    path: `/knowledge/books/${encodeURIComponent(bookKey(book))}`,
    query: { tab: 'split' }
  })
}

async function deleteShelfBook(book) {
  await deleteShelfBooks([book])
}

async function deleteSelectedShelfBooks() {
  const selectedKeys = new Set(selectedBookKeys.value)
  const targets = filteredBooks.value.filter((book) => selectedKeys.has(bookKey(book)))
  await deleteShelfBooks(targets, { batch: true })
}

async function deleteShelfBooks(targets = [], options = {}) {
  const booksToDelete = targets.filter(Boolean)
  if (!booksToDelete.length || deletingBookKey.value) return
  const isBatch = options.batch === true || booksToDelete.length > 1
  const title = isBatch
    ? `选中的 ${booksToDelete.length} 本书籍`
    : `「${bookTitle(booksToDelete[0])}」`
  try {
    await ElMessageBox.confirm(
      `确定移除${title}吗？这会删除本地书籍目录，无法在回收站恢复。`,
      isBatch ? '批量移除书籍' : '移除书籍',
      {
        confirmButtonText: '移除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )
  } catch {
    return
  }

  deletingBookKey.value = isBatch ? 'batch' : bookKey(booksToDelete[0])
  try {
    const results = await Promise.allSettled(
      booksToDelete.map(async (book) => {
        const result = await deleteBook(book.folderName || book.name)
        requireSuccessfulResult(result, '移除书籍失败')
        return { key: bookKey(book) }
      })
    )
    const succeededKeys = new Set(
      results.filter((item) => item.status === 'fulfilled').map((item) => item.value.key)
    )
    const failed = results.filter((item) => item.status === 'rejected')
    selectedBookKeys.value = selectedBookKeys.value.filter((key) => !succeededKeys.has(key))
    if (succeededKeys.has(selectedBookKey.value)) {
      selectedBookKey.value = ''
    }
    await loadLibrary()
    if (failed.length) {
      const firstReason = failed[0]?.reason?.message || '部分书籍移除失败'
      if (succeededKeys.size > 0) {
        ElMessage.warning(
          `已移除 ${succeededKeys.size} 本，${failed.length} 本失败：${firstReason}`
        )
      } else {
        ElMessage.error(firstReason)
      }
    } else {
      ElMessage.success(isBatch ? `已移除 ${booksToDelete.length} 本书籍` : '书籍已移除')
    }
  } catch (error) {
    ElMessage.error(error?.message || '移除书籍失败')
  } finally {
    deletingBookKey.value = ''
  }
}

function openMaterialDialog(item = null) {
  if (item) {
    Object.assign(materialForm, {
      id: item.id,
      title: item.title || '',
      type: item.type || 'note',
      summary: item.summary || '',
      content: item.content || '',
      tagsText: (item.tags || []).join('，')
    })
  } else {
    Object.assign(materialForm, {
      id: '',
      title: '',
      type: 'note',
      summary: '',
      content: '',
      tagsText: ''
    })
  }
  showMaterialDialog.value = true
}

function requireSuccessfulResult(result, fallback = '操作失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  return result
}

function requireKnowledgeItemResult(result, fallback = '保存失败') {
  requireSuccessfulResult(result, fallback)
  if (!result.item) throw new Error(fallback)
  return result
}

function requireAssetItemResult(result, fallback = '资产操作失败') {
  requireSuccessfulResult(result, fallback)
  if (!result.item) throw new Error(fallback)
  return result
}

function requireAssetRestoreResult(result, fallback = '恢复失败') {
  requireAssetItemResult(result, fallback)
  if (!result.restoredPath) throw new Error(fallback)
  return result
}

function requirePromptResult(result, fallback = '提示词操作失败') {
  requireSuccessfulResult(result, fallback)
  if (!result.preset) throw new Error(fallback)
  return result
}

function requireDeletedPromptResult(result, expectedId, fallback = '删除提示词失败') {
  requireSuccessfulResult(result, fallback)
  if (String(result.presetId || '') !== String(expectedId || '')) throw new Error(fallback)
  return result
}

async function saveMaterial() {
  if (!materialForm.title.trim()) {
    ElMessage.warning('请输入素材标题')
    return
  }
  savingMaterial.value = true
  const payload = {
    type: materialForm.type,
    title: materialForm.title.trim(),
    summary: materialForm.summary.trim(),
    content: materialForm.content.trim(),
    tags: splitTags(materialForm.tagsText),
    status: 'active',
    sourceType: materialForm.id ? undefined : 'manual',
    metadata: {
      usage: 'inspiration',
      assetStatus: 'pending_review'
    }
  }
  try {
    const result = materialForm.id
      ? await updateKnowledgeItem(materialForm.id, payload)
      : await createKnowledgeItem(payload)
    requireKnowledgeItemResult(result, '保存失败')
    ElMessage.success('素材已保存')
    showMaterialDialog.value = false
    await loadLibrary()
  } catch (error) {
    ElMessage.error(error?.message || '保存失败')
  } finally {
    savingMaterial.value = false
  }
}

function openBindDialog(item) {
  activeMaterialForBinding.value = item
  bindForm.bookId =
    item.relatedBookIds?.[0] ||
    selectedBookKey.value ||
    (books.value[0] ? bookKey(books.value[0]) : '')
  bindForm.assetType = item.type || 'chapter_inspiration'
  bindForm.tagsText = (item.tags || []).join('，')
  showBindDialog.value = true
}

async function saveMaterialBinding() {
  const item = activeMaterialForBinding.value
  if (!item || !bindForm.bookId) {
    ElMessage.warning('请选择作品')
    return
  }
  try {
    const tags = Array.from(new Set([...(item.tags || []), ...splitTags(bindForm.tagsText)]))
    const relatedBookIds = Array.from(new Set([...(item.relatedBookIds || []), bindForm.bookId]))
    const result = await updateKnowledgeItem(item.id, {
      type: bindForm.assetType === 'chapter_inspiration' ? item.type : bindForm.assetType,
      relatedBookIds,
      tags,
      metadata: {
        ...(item.metadata || {}),
        targetBookId: bindForm.bookId,
        usage: 'inspiration',
        assetStatus: item.metadata?.assetStatus || 'pending_review'
      }
    })
    requireKnowledgeItemResult(result, '绑定失败')
    ElMessage.success('已绑定到作品')
    showBindDialog.value = false
    await loadLibrary()
  } catch (error) {
    ElMessage.error(error?.message || '绑定失败')
  }
}

async function convertMaterial(item, type) {
  try {
    const result = await updateKnowledgeItem(item.id, {
      type,
      metadata: {
        ...(item.metadata || {}),
        assetStatus: 'edited',
        usage: 'draft'
      }
    })
    requireKnowledgeItemResult(result, '转换失败')
    ElMessage.success('已转换')
    await loadLibrary()
  } catch (error) {
    ElMessage.error(error?.message || '转换失败')
  }
}

async function archiveMaterial(item) {
  try {
    requireKnowledgeItemResult(await archiveKnowledgeItem(item.id), '删除失败')
    selectedMaterialIds.value = selectedMaterialIds.value.filter((id) => id !== item.id)
    ElMessage.success('已移入回收站')
    await loadLibrary()
  } catch (error) {
    ElMessage.error(error?.message || '删除失败')
  }
}

async function deleteSelectedMaterials() {
  const ids = Array.from(new Set(selectedMaterialIds.value.filter(Boolean)))
  if (!ids.length || batchDeletingMaterials.value) return
  try {
    await ElMessageBox.confirm(`确定把选中的 ${ids.length} 条素材移入回收站吗？`, '确认批量删除', {
      confirmButtonText: '移入回收站',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }
  batchDeletingMaterials.value = true
  try {
    const results = await Promise.allSettled(ids.map((id) => archiveKnowledgeItem(id)))
    const failed = results.filter(
      (item) => item.status === 'rejected' || item.value?.success !== true || !item.value?.item
    )
    selectedMaterialIds.value = []
    if (ids.includes(selectedMaterialId.value)) selectedMaterialId.value = ''
    await loadLibrary()
    if (failed.length) {
      ElMessage.warning(`已删除 ${ids.length - failed.length} 条，${failed.length} 条失败`)
    } else {
      ElMessage.success(`已删除 ${ids.length} 条素材`)
    }
  } catch (error) {
    ElMessage.error(error?.message || '批量删除失败')
  } finally {
    batchDeletingMaterials.value = false
  }
}

async function handleUploadImage() {
  if (!books.value.length) {
    ElMessage.warning('请先创建或导入一本书，再上传图片')
    return
  }
  if (!window.electron?.selectImage) {
    ElMessage.warning('当前环境没有图片选择能力')
    return
  }
  try {
    const result = await window.electron.selectImage()
    const imageInput = imageSelectionToImportInput(result)
    if (!imageInput) return
    requireAssetItemResult(
      await importAsset({
        ...imageInput,
        bookName:
          selectedBook.value?.folderName ||
          selectedBook.value?.name ||
          books.value[0].folderName ||
          books.value[0].name,
        type: 'attachment'
      }),
      '上传图片失败'
    )
    ElMessage.success('图片已上传')
    await loadLibrary()
  } catch (error) {
    ElMessage.error(error?.message || '上传图片失败')
  }
}

function openImageBindDialog(asset, type = '') {
  activeImageForBinding.value = asset
  Object.assign(imageBindForm, {
    id: asset.id,
    bookName:
      asset.bookFolderName ||
      asset.bookName ||
      selectedBook.value?.folderName ||
      selectedBook.value?.name ||
      '',
    type: type || normalizeImageType(asset.type)
  })
  showImageBindDialog.value = true
}

async function saveImageBinding() {
  if (!activeImageForBinding.value || !imageBindForm.bookName) {
    ElMessage.warning('请选择目标作品')
    return
  }
  const targetBook = books.value.find((book) =>
    [bookKey(book), book.name, book.folderName].includes(imageBindForm.bookName)
  )
  if (!targetBook) {
    ElMessage.warning('没有找到目标作品')
    return
  }
  if (requiresSplitForImageType(imageBindForm.type) && !isSplitReady(targetBook)) {
    ElMessage.warning('这本书还没有拆书结果，暂时只能绑定到作品、封面、章节或参考图')
    return
  }
  try {
    requireAssetItemResult(
      await attachAssetToBook({
        id: activeImageForBinding.value.id,
        bookName: imageBindForm.bookName,
        type: imageBindForm.type
      }),
      '绑定图片失败'
    )
    ElMessage.success('图片已绑定')
    showImageBindDialog.value = false
    await loadLibrary()
  } catch (error) {
    ElMessage.error(error?.message || '绑定图片失败')
  }
}

function downloadImage(asset) {
  if (!asset) return
  window.open(assetUrl(asset), '_blank')
}

function openImageLightbox(asset) {
  if (!asset) return
  previewImageAsset.value = { ...asset }
  previewImageUrl.value = assetUrl(asset)
  previewImageName.value = asset.name
  previewImageBook.value = asset.bookName || '未绑定作品'
  previewImageId.value = asset.id
  imagePreviewVisible.value = true
}

function handleImageDragOver(event) {
  const items = event.dataTransfer?.items || []
  const hasImage = Array.from(items).some(item => item.kind === 'file' && item.type.startsWith('image/'))
  if (hasImage) {
    isDraggingImage.value = true
  }
}

function handleImageDragLeave() {
  isDraggingImage.value = false
}

async function handleImageDrop(event) {
  isDraggingImage.value = false
  const files = Array.from(event.dataTransfer?.files || [])
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  const maxImageBytes = 20 * 1024 * 1024
  const imageFiles = files.filter((file) => allowedTypes.has(file.type))
  if (!imageFiles.length) {
    ElMessage.warning('仅支持 JPG、PNG、WebP 或 GIF 图片')
    return
  }
  if (imageFiles.length > 20) {
    ElMessage.warning('一次最多上传 20 张图片')
    return
  }
  const oversizedFiles = imageFiles.filter((file) => file.size > maxImageBytes)
  if (oversizedFiles.length) {
    ElMessage.warning(`图片不能超过 20 MB：${oversizedFiles[0].name}`)
    return
  }

  if (!books.value.length) {
    ElMessage.warning('请先创建或导入一本书，再上传图片')
    return
  }

  const targetBookName =
    selectedBook.value?.folderName ||
    selectedBook.value?.name ||
    books.value[0].folderName ||
    books.value[0].name
  const results = await Promise.allSettled(
    imageFiles.map(async (file) => {
      const dataUrl = await readFileAsDataUrl(file)
      const result = await importAsset({
        dataUrl,
        fileName: file.name,
        bookName: targetBookName,
        type: 'attachment'
      })
      if (result?.success === false) {
        throw new Error(result.message || '上传失败')
      }
      return result
    })
  )
  const successCount = results.filter((result) => result.status === 'fulfilled').length
  const failed = results
    .map((result, index) => ({ result, file: imageFiles[index] }))
    .filter(({ result }) => result.status === 'rejected')

  if (successCount) {
    await loadLibrary()
  }
  if (!failed.length) {
    ElMessage.success(`成功上传 ${successCount} 张图片`)
  } else {
    const firstReason = failed[0].result.reason?.message || '读取或上传失败'
    ElMessage.warning(`上传成功 ${successCount} 张，失败 ${failed.length} 张：${firstReason}`)
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      if (!dataUrl.startsWith('data:image/')) {
        reject(new Error('图片内容无法识别'))
        return
      }
      resolve(dataUrl)
    }
    reader.onerror = () => reject(new Error(`无法读取 ${file.name}`))
    reader.onabort = () => reject(new Error(`已取消读取 ${file.name}`))
    reader.readAsDataURL(file)
  })
}

async function deleteImage(asset) {
  try {
    await ElMessageBox.confirm(`确定删除「${asset.name}」吗？`, '删除图片', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    requireSuccessfulResult(await deleteAsset(asset.id), '删除失败')
    ElMessage.success('已移入回收站')
    selectedImageId.value = ''
    await loadLibrary()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error?.message || '删除失败')
  }
}

function openPromptDialog(preset = null) {
  if (preset) {
    const scope = isPromptBookScoped(preset) ? 'book' : 'global'
    const book = bookFromPrompt(preset)
    Object.assign(promptForm, {
      id: preset.id,
      name: preset.name || '',
      category: normalizePromptCategory(preset.category),
      scope,
      bookId: book
        ? bookKey(book)
        : preset.bookId || preset.bookFolderName || preset.bookName || '',
      originalScopeKey: promptScopeKey(preset),
      sourcePresetId: preset.sourcePresetId || preset.id || '',
      isBuiltin: Boolean(preset.isBuiltin),
      systemPrompt: preset.systemPrompt || '',
      userPromptTemplate: preset.userPromptTemplate || ''
    })
  } else {
    Object.assign(promptForm, {
      id: '',
      name: '',
      category: 'writing',
      scope: 'global',
      bookId: '',
      originalScopeKey: 'global',
      sourcePresetId: '',
      isBuiltin: false,
      systemPrompt: '',
      userPromptTemplate: ''
    })
  }
  showPromptDialog.value = true
}

async function savePrompt() {
  if (!promptForm.name.trim()) {
    ElMessage.warning('请输入提示词标题')
    return
  }
  try {
    if (promptForm.scope === 'book' && !promptForm.bookId) {
      ElMessage.warning('请选择作品')
      return
    }
    const scopePayload =
      promptForm.scope === 'book'
        ? promptScopePayloadForBookValue(promptForm.bookId)
        : { scope: 'global' }
    const targetScopeKey = promptForm.scope === 'book' ? `book:${promptForm.bookId}` : 'global'
    const originalPreset = promptPresets.value.find((preset) => preset.id === promptForm.id)
    const payload = {
      id: promptForm.id,
      name: promptForm.name.trim(),
      category: promptForm.category,
      ...scopePayload,
      sourcePresetId: promptForm.sourcePresetId || promptForm.id || '',
      systemPrompt: promptForm.systemPrompt,
      userPromptTemplate: promptForm.userPromptTemplate,
      modelParams: { temperature: 0.7, maxTokens: 2400, topP: 0.9 }
    }
    const shouldCreateCopy =
      !promptForm.id || promptForm.isBuiltin || promptForm.originalScopeKey !== targetScopeKey
    const result = shouldCreateCopy
      ? await createPromptPreset({
          ...scopePayload,
          preset: { ...payload, id: '', isBuiltin: false }
        })
      : await updatePromptPreset({ ...scopePayload, preset: payload, id: promptForm.id })
    requirePromptResult(result, '保存提示词失败')
    if (
      shouldCreateCopy &&
      originalPreset &&
      !originalPreset.isBuiltin &&
      promptForm.originalScopeKey !== targetScopeKey
    ) {
      const deleteResult = await deletePromptPreset({
        id: originalPreset.id,
        ...promptScopePayloadForPreset(originalPreset)
      })
      requireDeletedPromptResult(deleteResult, originalPreset.id, '删除旧提示词失败')
    }
    ElMessage.success('提示词已保存')
    showPromptDialog.value = false
    selectedPromptId.value = result?.preset?.id || promptForm.id
    await loadLibrary()
  } catch (error) {
    ElMessage.error(error?.message || '保存提示词失败')
  }
}

function usePrompt(preset) {
  router.push({ path: '/ai/prompts', query: { presetId: preset.id, ...promptBookQuery(preset) } })
}

async function duplicatePrompt(preset) {
  try {
    const scopePayload = promptScopePayloadForPreset(preset)
    const result = await createPromptPreset({
      ...scopePayload,
      preset: {
        ...preset,
        ...scopePayload,
        id: '',
        name: `${preset.name || '提示词'} 副本`,
        isBuiltin: false,
        sourcePresetId: preset.sourcePresetId || preset.id || ''
      }
    })
    requirePromptResult(result, '复制失败')
    ElMessage.success('已复制提示词')
    await loadLibrary()
  } catch (error) {
    ElMessage.error(error?.message || '复制失败')
  }
}

function openPromptBindDialog(preset) {
  activePromptForBinding.value = preset
  const book = bookFromPrompt(preset) || selectedBook.value || books.value[0] || null
  promptBindForm.bookId = book ? bookKey(book) : ''
  showPromptBindDialog.value = true
}

async function savePromptBinding() {
  const preset = activePromptForBinding.value
  const targetBook = findBookByKey(promptBindForm.bookId)
  if (!preset || !targetBook) {
    ElMessage.warning('请选择作品')
    return
  }
  const sourcePresetId = preset.sourcePresetId || preset.id
  const existing = promptPresets.value.find(
    (item) =>
      isPromptRelatedToBook(item, targetBook) &&
      ((item.sourcePresetId && item.sourcePresetId === sourcePresetId) || item.id === preset.id)
  )
  if (existing) {
    selectedPromptId.value = existing.id
    showPromptBindDialog.value = false
    ElMessage.info('提示词已绑定到该作品')
    return
  }
  try {
    const scopePayload = promptScopePayloadForBook(targetBook)
    const result = await createPromptPreset({
      ...scopePayload,
      preset: {
        ...preset,
        ...scopePayload,
        id: '',
        isBuiltin: false,
        sourcePresetId
      }
    })
    requirePromptResult(result, '绑定失败')
    selectedPromptId.value = result?.preset?.id || ''
    showPromptBindDialog.value = false
    ElMessage.success('提示词已绑定到作品')
    await loadLibrary()
  } catch (error) {
    ElMessage.error(error?.message || '绑定失败')
  }
}

async function deletePrompt(preset) {
  if (preset.isBuiltin) {
    ElMessage.warning('内置提示词不能删除')
    return
  }
  try {
    await ElMessageBox.confirm(`确定删除「${preset.name}」吗？`, '删除提示词', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    const result = await deletePromptPreset({
      id: preset.id,
      ...promptScopePayloadForPreset(preset)
    })
    requireSuccessfulResult(result, '删除失败')
    ElMessage.success('已删除')
    await loadLibrary()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error?.message || '删除失败')
  }
}

async function restoreTrashItem(item) {
  try {
    if (item.key.startsWith('image:')) {
      requireAssetRestoreResult(await restoreAsset(item.raw.id), '恢复失败')
    } else {
      requireKnowledgeItemResult(
        await updateKnowledgeItem(item.raw.id, { status: 'active' }),
        '恢复失败'
      )
    }
    ElMessage.success('已恢复')
    await loadLibrary()
  } catch (error) {
    ElMessage.error(error?.message || '恢复失败')
  }
}

async function deleteTrashItem(item) {
  try {
    await ElMessageBox.confirm(`永久删除「${item.title}」后无法恢复，确定继续吗？`, '永久删除', {
      type: 'error',
      confirmButtonText: '永久删除',
      cancelButtonText: '取消'
    })
    if (item.key.startsWith('material:')) {
      requireSuccessfulResult(await deleteKnowledgeItem(item.raw.id), '删除失败')
      ElMessage.success('已永久删除')
      await loadLibrary()
      return
    }
    ElMessage.info('图片文件已在回收站中，当前资产接口只支持恢复；永久清理请在文件目录中处理')
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error?.message || '删除失败')
  }
}

function matchesBookFilter(book) {
  if (bookFilter.value === 'all') return true
  if (bookFilter.value === 'creative') return isCreativeBook(book)
  if (bookFilter.value === 'downloaded') return isDownloadedBook(book)
  if (bookFilter.value === 'imported') return isImportedBook(book)
  if (bookFilter.value === 'reference') return isReferenceBook(book)
  if (bookFilter.value === 'unfiled') return !book.typeName && !book.bookRole && !book.sourceType
  return true
}

function bookFilterCount(key) {
  if (key === 'all') return books.value.length
  return books.value.filter((book) => {
    if (key === 'creative') return isCreativeBook(book)
    if (key === 'downloaded') return isDownloadedBook(book)
    if (key === 'imported') return isImportedBook(book)
    if (key === 'reference') return isReferenceBook(book)
    if (key === 'unfiled') return !book.typeName && !book.bookRole && !book.sourceType
    return true
  }).length
}

function firstQueryValue(value) {
  const raw = Array.isArray(value) ? value[0] : value
  return String(raw || '').trim()
}

function hasMaterialRouteFocus() {
  return Boolean(
    firstQueryValue(route.query.q) ||
      firstQueryValue(route.query.bookId) ||
      firstQueryValue(route.query.name)
  )
}

function applyMaterialRouteFocus() {
  keyword.value = firstQueryValue(route.query.q)
  materialBookKey.value = firstQueryValue(route.query.bookId) || firstQueryValue(route.query.name)
  resetListPage('materials')
}

function clearMaterialBookFilter() {
  materialBookKey.value = ''
  const nextQuery = { ...route.query }
  delete nextQuery.bookId
  delete nextQuery.name
  resetListPage('materials')
  void router.replace({ path: route.path, query: nextQuery })
}

function matchesMaterialFilter(item) {
  if (['market_hotspot', 'writer_activity'].includes(item.type)) return false
  if (materialFilter.value === 'all') return true
  if (materialFilter.value === 'market')
    return item.sourceType === 'market' || item.metadata?.sourceModule === 'market'
  if (materialFilter.value === 'imported') return item.sourceType === 'imported'
  if (materialFilter.value === 'unbound') return !(item.relatedBookIds || []).length
  return item.type === materialFilter.value
}

function normalizeFilterText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function materialBookFilterIds() {
  const key = materialBookKey.value
  if (!key) return []
  const book = findBookByKey(key)
  const ids = [key, ...(book ? bookIdentifiers(book) : [])]
  return Array.from(new Set(ids.map(normalizeFilterText).filter(Boolean)))
}

function materialBookCandidateTexts(item = {}) {
  const meta = item.metadata || {}
  const bookAnalysis = meta.bookAnalysis || {}
  return [
    ...(item.relatedBookIds || []),
    item.sourceName,
    meta.sourceBookId,
    meta.sourceBookName,
    meta.targetBookId,
    meta.targetBookName,
    meta.bookId,
    meta.bookName,
    meta.bookFolderName,
    meta.legacyBookName,
    bookAnalysis.bookTitle,
    bookAnalysis.sourceBookId,
    bookAnalysis.sourceBookName
  ]
    .map(normalizeFilterText)
    .filter(Boolean)
}

function matchesMaterialBookFilter(item) {
  const ids = materialBookFilterIds()
  if (!ids.length) return true
  const candidates = materialBookCandidateTexts(item)
  return candidates.some((candidate) =>
    ids.some(
      (id) =>
        candidate === id ||
        (id.length >= 4 && candidate.includes(id)) ||
        (candidate.length >= 4 && id.includes(candidate))
    )
  )
}

function matchesImageFilter(asset) {
  if (imageFilter.value === 'all') return true
  if (imageFilter.value === 'unbound') return !asset.bookName && !asset.bookFolderName
  return normalizeImageType(asset.type) === imageFilter.value
}

function matchesPromptFilter(preset) {
  if (promptFilter.value === 'all') return true
  return normalizePromptCategory(preset.category) === promptFilter.value
}

function normalizedKeyword() {
  return keyword.value.trim().toLowerCase()
}

function bookSearchText(book) {
  return [
    book.name,
    book.folderName,
    book.typeName,
    book.intro,
    book.sourceName,
    ...(book.tags || [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function materialSearchText(item) {
  const meta = item.metadata || {}
  const bookAnalysis = meta.bookAnalysis || {}
  return [
    item.title,
    item.summary,
    item.content,
    item.sourceName,
    item.sourceType,
    meta.sourceBookId,
    meta.sourceBookName,
    meta.targetBookId,
    meta.targetBookName,
    meta.bookName,
    meta.bookFolderName,
    meta.legacyBookName,
    bookAnalysis.bookTitle,
    ...(item.tags || [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function imageSearchText(asset) {
  return [
    asset.name,
    asset.bookName,
    asset.bookFolderName,
    asset.type,
    asset.source,
    asset.relativePath
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function promptSearchText(preset) {
  return [
    preset.name,
    preset.category,
    preset.systemPrompt,
    preset.userPromptTemplate,
    promptScopeText(preset)
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function bookKey(book = {}) {
  return String(book.id || book.folderName || book.name || '')
}

function bookTitle(book = {}) {
  return book.name || book.folderName || '未命名作品'
}

function sameText(left, right) {
  return String(left || '').trim() === String(right || '').trim()
}

function bookIdentifiers(book = {}) {
  return [bookKey(book), book.id, book.folderName, book.name].filter(Boolean).map(String)
}

function findBookByKey(value) {
  const key = String(value || '').trim()
  if (!key) return null
  return books.value.find((book) => bookIdentifiers(book).some((id) => sameText(id, key))) || null
}

function promptBookIdentifiers(preset = {}) {
  return [preset.bookId, preset.bookFolderName, preset.bookName].filter(Boolean).map(String)
}

function bookFromPrompt(preset = {}) {
  const ids = promptBookIdentifiers(preset)
  if (!ids.length && !preset.bookPath) return null
  return (
    books.value.find((book) => {
      const bookIds = bookIdentifiers(book)
      const path = String(preset.bookPath || '')
      return (
        ids.some((id) => bookIds.some((bookId) => sameText(bookId, id))) ||
        bookIds.some((bookId) => path.includes(bookId))
      )
    }) || null
  )
}

function isPromptBookScoped(preset = {}) {
  return (
    preset.scope === 'book' ||
    Boolean(preset.bookId || preset.bookName || preset.bookFolderName || preset.bookPath)
  )
}

function promptScopeText(preset = {}) {
  if (preset.isBuiltin || preset.scope === 'builtin') return '内置'
  if (isPromptBookScoped(preset)) {
    const book = bookFromPrompt(preset)
    return `本书：${bookTitle(book || { name: preset.bookName || preset.bookFolderName || preset.bookId })}`
  }
  return '全局'
}

function promptScopeKey(preset = {}) {
  if (!isPromptBookScoped(preset)) return 'global'
  const book = bookFromPrompt(preset)
  return `book:${book ? bookKey(book) : preset.bookId || preset.bookFolderName || preset.bookName || preset.bookPath || ''}`
}

function promptScopePayloadForBook(book = {}) {
  return {
    scope: 'book',
    bookId: bookKey(book),
    bookName: book.name || book.folderName || bookKey(book),
    bookFolderName: book.folderName || book.name || bookKey(book)
  }
}

function promptScopePayloadForBookValue(value) {
  const book = findBookByKey(value)
  if (book) return promptScopePayloadForBook(book)
  const key = String(value || '').trim()
  return { scope: 'book', bookId: key, bookName: key, bookFolderName: key }
}

function promptScopePayloadForPreset(preset = {}) {
  if (!isPromptBookScoped(preset)) return { scope: 'global' }
  const book = bookFromPrompt(preset)
  return book
    ? promptScopePayloadForBook(book)
    : {
        scope: 'book',
        bookId: preset.bookId || preset.bookFolderName || preset.bookName || '',
        bookName: preset.bookName || preset.bookFolderName || preset.bookId || '',
        bookFolderName: preset.bookFolderName || preset.bookName || preset.bookId || ''
      }
}

function promptBookQuery(preset = {}) {
  const payload = promptScopePayloadForPreset(preset)
  if (payload.scope !== 'book') return {}
  return {
    bookId: payload.bookId || payload.bookFolderName || payload.bookName,
    name: payload.bookFolderName || payload.bookName || payload.bookId
  }
}

function isPromptRelatedToBook(preset = {}, book = {}) {
  if (!book || !isPromptBookScoped(preset)) return false
  const bookIds = bookIdentifiers(book)
  const promptIds = promptBookIdentifiers(preset)
  const path = String(preset.bookPath || '')
  return (
    promptIds.some((id) => bookIds.some((bookId) => sameText(bookId, id))) ||
    bookIds.some((bookId) => path.includes(bookId))
  )
}

function isDownloadedBook(book = {}) {
  return (
    book.bookRole === 'downloaded' ||
    book.sourceType === 'downloaded' ||
    book.sourceType === 'downloadedNovel' ||
    book.downloaded === true
  )
}

function isCreativeBook(book = {}) {
  return !isDownloadedBook(book) && !isImportedBook(book) && !isReferenceBook(book)
}

function isImportedBook(book = {}) {
  return (
    ['imported', 'file_import', 'txt', 'epub'].includes(book.sourceType) ||
    book.importedFrom === 'file'
  )
}

function isReferenceBook(book = {}) {
  return book.bookRole === 'reference' || book.sourceType === 'reference'
}

function bookTypeLabel(book = {}) {
  if (isDownloadedBook(book)) return '下载书籍'
  if (isImportedBook(book)) return '导入书籍'
  if (isReferenceBook(book)) return '参考资料'
  return '我的作品'
}

function analysisStatus(book = {}) {
  if (book.analysisStatus) return book.analysisStatus
  if (isDownloadedBook(book) || isImportedBook(book) || isReferenceBook(book)) {
    if (hasSplitKnowledge(book)) return 'split_done'
    return chapterCount(book) > 0 ? 'split_pending' : 'imported'
  }
  return hasSplitKnowledge(book) ? 'split_done' : 'parsed'
}

function bookStatusLabel(book = {}) {
  const map = {
    imported: '待解析',
    parsing: '解析中',
    parsed: isCreativeBook(book) ? '正在创作' : '待拆书',
    split_pending: '待拆书',
    splitting: '拆书中',
    split_partial: '部分拆书',
    split_done: '已拆书',
    split_failed: '拆书失败',
    outdated: '需重新拆书',
    archived: '已归档'
  }
  return map[analysisStatus(book)] || (isCreativeBook(book) ? '正在创作' : '待拆书')
}

function chapterCount(book = {}) {
  return Number(
    chapterCountMap.value[bookKey(book)] || book.totalChapterCount || book.chapterCount || 0
  )
}

function bookWordCount(book = {}) {
  const chapterWords = Number(wordCountMap.value[bookKey(book)] || 0)
  return chapterWords > 0 ? chapterWords : bookWordCountFromMeta(book)
}

function bookWordCountFromMeta(book = {}) {
  const values = [
    book.totalWords,
    book.wordCount,
    book.words,
    book.totalWordCount,
    book.metadata?.totalWords,
    book.metadata?.wordCount
  ]
  for (const value of values) {
    const count = Number(value)
    if (Number.isFinite(count) && count > 0) return count
  }
  return 0
}

function chapterCountText(book = {}) {
  const count = chapterCount(book)
  return count ? `${count} 章` : '暂无章节'
}

function bookTags(book = {}) {
  return [book.typeName, book.sourcePlatform || book.sourceName, ...(book.tags || [])].filter(
    Boolean
  )
}

function relatedAssets(book = {}) {
  const names = new Set([bookKey(book), book.name, book.folderName].filter(Boolean).map(String))
  return assetItems.value.filter(
    (asset) => names.has(asset.bookName) || names.has(asset.bookFolderName)
  )
}

function relatedKnowledge(book = {}) {
  const names = new Set([bookKey(book), book.name, book.folderName].filter(Boolean).map(String))
  return knowledgeItems.value.filter((item) => {
    const related = item.relatedBookIds || []
    const meta = item.metadata || {}
    return (
      related.some((id) => names.has(String(id))) ||
      names.has(item.sourceName) ||
      names.has(meta.legacyBookName)
    )
  })
}

function hasSplitKnowledge(book = {}) {
  return relatedKnowledge(book).some(
    (item) =>
      item.type === 'book_analysis' ||
      item.metadata?.legacyExtractionId ||
      item.metadata?.bookAnalysis
  )
}

function isSplitReady(book = {}) {
  return ['split_done', 'split_partial'].includes(analysisStatus(book)) || hasSplitKnowledge(book)
}

function assetSummaryForBook(book = {}) {
  const assets = relatedAssets(book)
  const knowledge = relatedKnowledge(book)
  const prompts = promptPresets.value.filter((preset) => isPromptRelatedToBook(preset, book))
  const splitReady = isSplitReady(book)
  const countType = (types) => knowledge.filter((item) => types.includes(item.type)).length
  const base = [
    {
      label: '角色',
      value: splitReady ? String(countType(['character', 'character_setting'])) : '待拆书'
    },
    {
      label: '世界观',
      value: splitReady ? String(countType(['world_setting', 'setting'])) : '待拆书'
    },
    { label: '图片', value: String(assets.length) },
    { label: '拆书片段', value: splitReady ? String(countType(['book_analysis'])) : '待拆书' }
  ]
  if (!splitReady && (isDownloadedBook(book) || isImportedBook(book) || isReferenceBook(book))) {
    return [
      ...base.slice(0, 2),
      { label: '伏笔', value: '待拆书' },
      { label: '图谱', value: '待生成' },
      { label: '图片', value: String(assets.length) },
      { label: '提示词', value: String(prompts.length) }
    ]
  }
  return [
    ...base,
    { label: '提示词', value: String(prompts.length) },
    { label: '图谱', value: splitReady ? '可生成' : '待生成' }
  ]
}

function recentActionText(book = {}) {
  const status = analysisStatus(book)
  if (status === 'split_failed') return '上次拆书失败，可以进入资产台查看原因并重新拆书。'
  if (status === 'outdated') return '正文有变化，旧资产可能需要重新拆书。'
  if (isSplitReady(book)) return '已存在拆书资产，可以进入资产台继续整理。'
  if (isDownloadedBook(book) || isImportedBook(book) || isReferenceBook(book))
    return '还没有拆书结果，可以先阅读或开始拆书。'
  return '可以进入创作台继续写作。'
}

function shouldShowSplitAction(book = {}) {
  return isDownloadedBook(book) || isImportedBook(book) || isReferenceBook(book)
}

function splitActionLabel(book = {}) {
  const status = analysisStatus(book)
  if (status === 'split_partial') return '查看拆书结果'
  if (status === 'split_done') return '查看拆书结果'
  if (status === 'split_failed') return '重新拆书'
  if (status === 'splitting') return '查看进度'
  return '开始拆书'
}

function bookUpdatedAt(book = {}) {
  return book.updatedAt || book.lastModified || book.createdAt || ''
}

function webCoverUrl(book = {}) {
  if (!book.coverUrl) return ''
  if (book.coverUrl.startsWith('http://') || book.coverUrl.startsWith('https://'))
    return book.coverUrl
  const params = new URLSearchParams({
    book: book.folderName || book.name || '',
    file: book.coverUrl
  })
  return `/api/books/cover?${params.toString()}`
}

function hasBookCover(book = {}) {
  return Boolean(webCoverUrl(book))
}

const DEFAULT_WABI_COVER_COLOR = '#6f7a68'
const mutedCoverColorMap = new Map([
  ['#22345c', DEFAULT_WABI_COVER_COLOR],
  ['#23314f', DEFAULT_WABI_COVER_COLOR],
  ['rgb(34, 52, 92)', DEFAULT_WABI_COVER_COLOR],
  ['rgb(35, 49, 79)', DEFAULT_WABI_COVER_COLOR]
])

function wabiCoverColor(color, fallback = DEFAULT_WABI_COVER_COLOR) {
  const normalized = String(color || '')
    .trim()
    .toLowerCase()
  return mutedCoverColorMap.get(normalized) || normalized || fallback
}

function bookCoverStyle(book = {}) {
  const cover = webCoverUrl(book)
  if (cover) return { backgroundImage: `url(${cover})` }
  return {
    backgroundColor: wabiCoverColor(
      book.coverColor,
      isDownloadedBook(book) ? '#8a735d' : DEFAULT_WABI_COVER_COLOR
    )
  }
}

function materialTypeLabel(item = {}) {
  const map = {
    topic_card: '灵感卡',
    note: '摘录片段',
    book_analysis: '拆书片段',
    world_setting: '待整理设定',
    plot_fragment: '创作台提取',
    character_setting: '角色设定',
    prompt_template: '提示词'
  }
  return map[item.type] || '素材'
}

function materialSourceLabel(item = {}) {
  const map = {
    market: '市场灵感',
    writer_activity: '作家活动',
    book_analysis: '下载书籍',
    ai_workshop: 'AI 工坊',
    imported: '上传资料',
    manual: '手动创建'
  }
  return map[item.sourceType] || item.sourceName || '手动创建'
}

function bindingStatusLabel(item = {}) {
  if (item.status === 'discarded') return '已废弃'
  if (item.metadata?.usage === 'canon' || item.metadata?.assetStatus === 'adopted') return '已采纳'
  if ((item.relatedBookIds || []).length) return '已绑定作品'
  return '未绑定'
}

function sourceBookName(item = {}) {
  const key =
    item.metadata?.sourceBookId ||
    item.metadata?.sourceBookName ||
    item.metadata?.legacyBookName ||
    item.metadata?.targetBookId ||
    item.sourceName
  const book = findBookByKey(key)
  if (book) return bookTitle(book)
  return (
    item.metadata?.sourceBookName ||
    item.metadata?.legacyBookName ||
    item.sourceName ||
    key ||
    '未绑定'
  )
}

function usageLabel(item = {}) {
  const usage = item.metadata?.usage || 'inspiration'
  const map = {
    reference: '参考',
    inspiration: '灵感',
    canon: '正式设定',
    draft: '草稿',
    discarded: '已废弃'
  }
  return map[usage] || usage
}

function imageTypeLabel(asset = {}) {
  const map = {
    cover: '封面',
    character: '角色图',
    scene: '场景图',
    map: '地图',
    prop: '道具图',
    atmosphere: '氛围图',
    poster: '宣传图',
    reference: '参考图',
    attachment: '参考图',
    trash: '回收站'
  }
  return map[normalizeImageType(asset.type)] || asset.type || '图片'
}

function normalizeImageType(type = '') {
  const map = {
    attachment: 'reference',
    characters: 'character',
    scenes: 'scene'
  }
  return map[type] || type || 'reference'
}

function requiresSplitForImageType(type) {
  return ['character', 'scene', 'map', 'prop', 'world', 'foreshadowing'].includes(type)
}

function promptCategoryLabel(category = '') {
  const key = normalizePromptCategory(category)
  return promptFilters.find((item) => item.key === key)?.label || category || '自定义'
}

function normalizePromptCategory(category = '') {
  const map = {
    topic: 'writing',
    continue: 'continueWrite',
    continue_write: 'continueWrite',
    continueWrite: 'continueWrite',
    deconstruct: 'deconstruct',
    extraction: 'deconstruct',
    settingTree: 'world',
    plotEvolution: 'writing',
    plot: 'writing',
    golden_chapters: 'writing',
    chat: 'custom',
    general: 'custom',
    summarize: 'writing'
  }
  return map[category] || category || 'custom'
}

function promptParamsText(preset = {}) {
  const params = preset.modelParams || {}
  const values = [
    params.temperature != null ? `temperature ${params.temperature}` : '',
    params.maxTokens != null ? `maxTokens ${params.maxTokens}` : '',
    params.topP != null ? `topP ${params.topP}` : ''
  ].filter(Boolean)
  return values.join('，') || '未设置'
}

function materialTrashKind(item = {}) {
  if (item.type === 'book_analysis') return 'book_analysis'
  if (item.type === 'character_setting') return 'character'
  if (item.type === 'world_setting') return 'world'
  return 'material'
}

function materialCount(type) {
  return materialItems.value.filter((item) => {
    if (['market_hotspot', 'writer_activity'].includes(item.type)) return false
    if (!matchesMaterialBookFilter(item)) return false
    if (type === 'all') return true
    if (type === 'market')
      return item.sourceType === 'market' || item.metadata?.sourceModule === 'market'
    if (type === 'imported') return item.sourceType === 'imported'
    if (type === 'unbound') return !(item.relatedBookIds || []).length
    return item.type === type
  }).length
}

function imageCount(type) {
  return imageItems.value.filter((asset) => {
    if (type === 'all') return true
    if (type === 'unbound') return !asset.bookName && !asset.bookFolderName
    return normalizeImageType(asset.type) === type
  }).length
}

function promptCount(type) {
  return promptPresets.value.filter(
    (preset) => type === 'all' || normalizePromptCategory(preset.category) === type
  ).length
}

function trashCount(type) {
  return trashRows.value.filter((item) => type === 'all' || item.kind === type).length
}

function assetUrl(asset) {
  return getAssetUrl(asset)
}

function flattenChapters(tree = []) {
  return tree.flatMap((node) => {
    if (Array.isArray(node.children))
      return node.children.filter((child) => child.type === 'chapter')
    return node.type === 'chapter' ? [node] : []
  })
}

function splitTags(text = '') {
  return String(text)
    .split(/[，,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatWords(value) {
  const count = Number(value || 0)
  if (count >= 10000) return `${(count / 10000).toFixed(1)} 万字`
  return `${count.toLocaleString('zh-CN')} 字`
}

function formatDate(value) {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未记录'
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function dateValue(value) {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}
</script>

<style lang="scss" scoped>
.creation-library-page {
  width: min(100%, 1540px);
  margin: 0 auto;
  color: var(--wabi-ink);
}

.library-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 22px;

  h1 {
    margin: 4px 0 8px;
    color: var(--wabi-ink);
    font-family: 'Noto Serif SC', 'Songti SC', serif;
    font-size: clamp(30px, 2.2vw, 40px);
    letter-spacing: 0.04em;
  }

  p {
    margin: 0;
    color: var(--wabi-muted);
    line-height: 1.7;
  }
}

.eyebrow {
  margin: 0;
  color: var(--wabi-earth);
  font-size: 13px;
  font-weight: 700;
}

.header-actions,
.panel-toolbar,
.detail-actions,
.preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.library-section-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: -8px 0 18px;
}

.library-section-nav button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.72);
  color: var(--wabi-ink-soft);
  cursor: pointer;
  font: inherit;
  padding: 8px 12px;

  &.active,
  &:hover {
    border-color: rgba(111, 122, 104, 0.34);
    background: rgba(111, 122, 104, 0.12);
    color: var(--wabi-moss-dark);
  }

  :deep(svg) {
    flex: 0 0 auto;
  }
}

.bookshelf-page,
.manager-grid {
  display: grid;
  gap: 18px;
}

.bookshelf-toolbar,
.shelf-card,
.preview-card,
.card-panel {
  border: 1px solid var(--wabi-line);
  border-radius: 12px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.34), transparent 56%),
    linear-gradient(180deg, rgba(251, 250, 246, 0.94), rgba(240, 236, 227, 0.84));
  box-shadow: var(--wabi-shadow-soft);
}

.bookshelf-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;

  :deep(.el-input) {
    min-width: 180px;
    flex: 1 1 260px;
  }

  :deep(.el-button) {
    flex: 0 0 auto;
  }
}

.search-mode {
  display: inline-flex;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.72);

  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    border: 0;
    background: transparent;
    color: var(--wabi-muted);
    cursor: pointer;
    font: inherit;
    padding: 0 12px;

    &.active {
      background: rgba(111, 122, 104, 0.12);
      color: var(--wabi-moss-dark);
    }
  }
}

.toolbar-source-select {
  width: 138px;
  flex: 0 0 auto;
}

.icon-filter-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  flex: 0 0 auto;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.72);
  color: var(--wabi-muted);
  cursor: pointer;
  font: inherit;
  padding: 0 10px;

  &.active,
  &:hover {
    border-color: rgba(111, 122, 104, 0.34);
    color: var(--wabi-moss-dark);
  }
}

.compact-filter-menu {
  display: grid;
  gap: 6px;

  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--wabi-ink-soft);
    cursor: pointer;
    font: inherit;
    padding: 8px 10px;

    &.active,
    &:hover {
      background: rgba(111, 122, 104, 0.12);
      color: var(--wabi-moss-dark);
    }

    b {
      font-size: 12px;
      font-weight: 600;
      opacity: 0.76;
    }
  }
}

.bookshelf-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
  align-items: start;

  &.has-preview {
    grid-template-columns: minmax(0, 1fr) 360px;
  }
}

.shelf-card,
.preview-card,
.card-panel {
  padding: 18px;
}

.section-title,
.panel-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  h2 {
    margin: 0;
    color: var(--wabi-ink);
    font-size: 22px;
  }

  p {
    margin: 6px 0 0;
    color: var(--wabi-muted);
  }
}

.book-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.book-card {
  position: relative;
  display: grid;
  grid-template-columns: 118px minmax(0, 1fr);
  gap: 14px;
  min-height: 216px;
  overflow: hidden;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.58);
  cursor: pointer;
  padding: 12px;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;

  &.selected,
  &:hover {
    border-color: rgba(111, 122, 104, 0.36);
    background: rgba(240, 236, 227, 0.72);
    box-shadow: var(--wabi-shadow-soft);
    transform: translateY(-1px);
  }

  &.checked {
    border-color: rgba(154, 78, 56, 0.34);
    box-shadow: inset 3px 0 0 rgba(154, 78, 56, 0.62);
  }

  &:hover .quick-actions {
    opacity: 1;
    transform: translateY(0);
  }
}

.section-actions {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;

  span {
    color: var(--wabi-muted);
    font-size: 13px;
  }

  :deep(.el-button) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
}

.book-select {
  position: absolute;
  top: 9px;
  left: 9px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(168, 125, 61, 0.18);
  border-radius: 999px;
  background: rgba(251, 250, 246, 0.9);
  color: var(--wabi-muted);
  cursor: pointer;
  font-size: 12px;
  padding: 5px 8px;

  input {
    width: 14px;
    height: 14px;
    margin: 0;
    accent-color: #9a4e38;
  }
}

.book-cover,
.preview-cover {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgba(58, 55, 49, 0.16);
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;

  &.placeholder {
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.14), transparent 22%),
      linear-gradient(145deg, #6f7a68, #8a735d 58%, #c5b49e);
  }
}

.book-cover {
  width: 118px;
  aspect-ratio: 2 / 3;
  align-self: start;
  border-radius: 8px;
}

.preview-cover {
  width: 132px;
  aspect-ratio: 3 / 4;
  border-radius: 16px;
}

.book-mark {
  width: 40%;
  aspect-ratio: 3 / 4;
  border-radius: 4px 9px 9px 4px;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.36), transparent 18%), rgba(255, 248, 224, 0.74);
  box-shadow: 10px 10px 24px rgba(12, 20, 36, 0.16);
}

.book-info {
  min-width: 0;

  h3 {
    margin: 10px 0 8px;
    color: var(--wabi-ink);
    font-size: 19px;
    line-height: 1.35;
  }

  p {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--wabi-muted);
    line-height: 1.55;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
}

.book-card-head,
.meta-line,
.asset-mini-row {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.book-card-head {
  position: absolute;
  top: 9px;
  right: 9px;

  span,
  b {
    display: inline-grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border: 1px solid rgba(168, 125, 61, 0.18);
    border-radius: 6px;
  }

  span {
    background: rgba(251, 250, 246, 0.86);
    color: var(--wabi-earth);
  }
}

.meta-line {
  margin-top: 10px;
  color: var(--wabi-muted);
  font-size: 13px;
}

.asset-mini-row {
  margin-top: 10px;

  span {
    border: 1px solid rgba(111, 122, 104, 0.14);
    border-radius: 4px;
    background: rgba(111, 122, 104, 0.06);
    color: var(--wabi-muted);
    font-size: 13px;
    padding: 4px 7px;
  }
}

.quick-actions {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  gap: 8px;
  opacity: 0;
  transform: translateY(4px);
  transition: all 0.18s ease;

  button {
    border: 1px solid var(--wabi-line);
    border-radius: 8px;
    background: rgba(251, 250, 246, 0.86);
    color: var(--wabi-moss-dark);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    padding: 7px 10px;
  }
}

.preview-card {
  position: sticky;
  top: 0;
  display: grid;
  gap: 16px;
}

.preview-main {
  h2 {
    margin: 10px 0 8px;
    color: var(--wabi-ink);
    font-size: 24px;
  }

  p {
    margin: 0;
    color: var(--wabi-muted);
    line-height: 1.7;
  }
}

.type-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  border: 1px solid rgba(138, 115, 93, 0.16);
  border-radius: 4px;
  background: rgba(138, 115, 93, 0.08);
  color: var(--wabi-earth);
  font-size: 13px;
  font-weight: 700;
  padding: 4px 8px;
}

.book-type-icon {
  width: 28px;
  height: 28px;
  padding: 0;
}

.preview-meta,
.detail-list {
  display: grid;
  gap: 8px;

  div {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    gap: 10px;
    border-radius: 12px;
    background: rgba(251, 250, 246, 0.6);
    padding: 9px 10px;
  }

  dt {
    color: var(--wabi-muted);
    font-size: 13px;
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--wabi-ink);
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.preview-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;

  span {
    border: 1px solid rgba(111, 122, 104, 0.14);
    border-radius: 4px;
    background: rgba(111, 122, 104, 0.06);
    color: var(--wabi-muted);
    font-size: 13px;
    padding: 4px 7px;
  }
}

.asset-status-panel,
.recent-action-panel {
  border: 1px solid rgba(168, 125, 61, 0.14);
  border: 1px solid var(--wabi-line);
  border-radius: 10px;
  background: rgba(251, 250, 246, 0.58);
  padding: 12px;

  h3 {
    margin: 0 0 10px;
    color: var(--wabi-ink);
    font-size: 15px;
  }

  p {
    margin: 0;
    color: var(--wabi-muted);
    line-height: 1.6;
  }
}

.asset-status-panel > div {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  span {
    display: grid;
    gap: 3px;
    border-radius: 8px;
    background: rgba(251, 250, 246, 0.82);
    padding: 8px;
  }

  b {
    color: var(--wabi-muted);
    font-size: 12px;
  }

  strong {
    color: var(--wabi-ink);
    font-size: 14px;
  }
}

.preview-empty,
.soft-empty {
  display: grid;
  justify-items: start;
  gap: 10px;
  color: var(--wabi-muted);
  line-height: 1.6;

  strong {
    color: var(--wabi-ink);
    font-size: 18px;
  }

  button {
    border: 1px solid rgba(111, 122, 104, 0.46);
    border-radius: 8px;
    background: var(--wabi-moss);
    color: #fbfaf6;
    cursor: pointer;
    font: inherit;
    padding: 8px 12px;
  }
}

.read-error-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 14px;
  border: 1px solid rgba(154, 78, 56, 0.32);
  border-radius: 10px;
  background: rgba(154, 78, 56, 0.08);
  color: #7b3f31;
  line-height: 1.6;
  padding: 10px 12px;

  span {
    min-width: 0;
  }

  :deep(.el-button) {
    flex: 0 0 auto;
  }
}

.manager-grid {
  grid-template-columns: 190px minmax(0, 1fr) 340px;
  align-items: start;
}

.side-filter {
  display: grid;
  gap: 8px;

  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 42px;
    border: 1px solid var(--wabi-line);
    border-radius: 8px;
    background: rgba(251, 250, 246, 0.58);
    color: var(--wabi-ink-soft);
    cursor: pointer;
    font: inherit;
    padding: 8px 10px;

    &.active,
    &:hover {
      border-color: rgba(111, 122, 104, 0.34);
      background: rgba(111, 122, 104, 0.12);
      color: var(--wabi-moss-dark);
    }
  }
}

.list-panel,
.detail-card {
  min-width: 0;
}

.panel-toolbar {
  align-items: center;
}

.material-book-filter-tag {
  max-width: 240px;
  flex: 0 1 auto;
}

.material-book-filter-tag :deep(.el-tag__content) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  border-top: 1px solid var(--wabi-line);
  color: var(--wabi-muted);
  font-size: 13px;
  margin-top: 14px;
  padding-top: 14px;
}

.material-list,
.prompt-list,
.trash-list {
  display: grid;
  gap: 10px;
}

.material-card,
.prompt-row,
.trash-row {
  border: 1px solid var(--wabi-line);
  border-radius: 10px;
  background: rgba(251, 250, 246, 0.58);
  cursor: pointer;
  padding: 14px;

  &.selected,
  &:hover {
    border-color: rgba(111, 122, 104, 0.36);
    background: rgba(240, 236, 227, 0.72);
  }

  h3 {
    margin: 10px 0 6px;
    color: var(--wabi-ink);
    font-size: 18px;
  }

  p {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--wabi-muted);
    line-height: 1.6;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
}

.material-card {
  position: relative;

  &.checked {
    border-color: rgba(168, 125, 61, 0.5);
    box-shadow: inset 3px 0 0 var(--wabi-earth);
  }

  > div:first-of-type {
    padding-right: 92px;
  }
}

.material-select {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--wabi-line);
  border-radius: 999px;
  background: rgba(251, 250, 246, 0.9);
  color: var(--wabi-muted);
  cursor: pointer;
  font-size: 12px;
  padding: 5px 8px;

  input {
    width: 14px;
    height: 14px;
    margin: 0;
    accent-color: var(--wabi-moss);
  }
}

.detail-card {
  position: sticky;
  top: 0;
  display: grid;
  gap: 14px;

  h2 {
    margin: 0;
    color: var(--wabi-ink);
    font-size: 22px;
    line-height: 1.35;
  }

  p {
    margin: 0;
    color: var(--wabi-muted);
    line-height: 1.7;
  }
}

.image-board {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;
}

.image-card {
  display: grid;
  gap: 8px;
  border: 1px solid var(--wabi-line);
  border-radius: 10px;
  background: rgba(251, 250, 246, 0.58);
  cursor: pointer;
  padding: 10px;

  &.selected,
  &:hover {
    border-color: rgba(111, 122, 104, 0.36);
    background: rgba(240, 236, 227, 0.72);
  }

  h3,
  p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  h3 {
    margin: 0;
    color: var(--wabi-ink);
    font-size: 15px;
  }

  p {
    margin: 0;
    color: var(--wabi-muted);
    font-size: 12px;
  }
}

.image-preview,
.large-image-preview {
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 14px;
  background: rgba(138, 115, 93, 0.12);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.image-preview {
  aspect-ratio: 4 / 3;
}

.large-image-preview {
  aspect-ratio: 4 / 3;
}

.prompt-editor-card {
  label {
    display: grid;
    gap: 6px;

    span {
      color: var(--wabi-muted);
      font-size: 13px;
    }
  }

  textarea {
    min-height: 110px;
    resize: vertical;
    border: 1px solid var(--wabi-line);
    border-radius: 10px;
    background: rgba(251, 250, 246, 0.72);
    color: var(--wabi-ink);
    line-height: 1.7;
    padding: 10px;
  }
}

@media (max-width: 1280px) {
  .bookshelf-layout,
  .manager-grid {
    grid-template-columns: 1fr;
  }

  .preview-card,
  .detail-card {
    position: static;
  }

  .side-filter {
    display: flex;
    overflow-x: auto;

    button {
      min-width: 132px;
    }
  }
}

@media (max-width: 760px) {
  .library-header,
  .section-title,
  .panel-toolbar {
    display: grid;
  }

  .bookshelf-toolbar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
    gap: 10px;

    :deep(.el-input) {
      grid-column: 1 / -1;
      min-width: 0;
    }

    :deep(.el-button) {
      width: 100%;
      min-width: 0;
    }
  }

  .search-mode,
  .toolbar-source-select,
  .icon-filter-button {
    width: 100%;
    min-width: 0;
  }

  .search-mode button {
    flex: 1 1 0;
    justify-content: center;
    padding: 0 8px;
  }

  .shelf-card,
  .preview-card,
  .card-panel {
    padding: 14px;
  }

  .side-filter {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    overflow: visible;
  }

  .side-filter button {
    min-width: 0;
    min-height: 42px;
    padding: 8px;
  }

  .book-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .book-card {
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 12px;
    min-height: 0;
    align-items: start;
    padding: 12px;
  }

  .book-cover {
    width: 72px;
  }

  .book-info {
    align-self: start;
  }

  .book-info h3 {
    margin: 0 34px 6px 0;
    font-size: 17px;
  }

  .book-info p {
    font-size: 14px;
    line-height: 1.55;
  }

  .book-card-head {
    top: 12px;
    right: 12px;
  }

  .meta-line,
  .asset-mini-row {
    gap: 7px;
    margin-top: 8px;
  }

  .quick-actions {
    position: static;
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    opacity: 1;
    transform: none;
  }

  .quick-actions button {
    min-width: 0;
    padding: 8px 10px;
  }

  .library-pagination {
    display: grid;
    justify-items: start;
    gap: 8px;
    font-size: 12px;
  }

  .library-pagination :deep(.el-pagination) {
    display: flex;
    width: 100%;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px 4px;
    white-space: normal;
  }

  .library-pagination :deep(.el-pager) {
    display: flex;
    flex: 0 1 auto;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px;
  }

  .library-pagination :deep(.el-pagination__sizes),
  .library-pagination :deep(.el-pagination__total) {
    margin-left: 0;
  }

  .library-pagination :deep(.el-pagination__sizes) {
    min-width: 110px;
  }

  .library-pagination :deep(.el-pagination__total) {
    color: var(--wabi-muted);
    font-size: 12px;
  }
}

.book-card.add-book-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px dashed rgba(99, 102, 241, 0.35); // matches theme/primary border
  background: rgba(99, 102, 241, 0.02);
  min-height: 216px;
  transition: all 0.3s ease;
  text-align: center;
  padding: 20px;
}

.book-card.add-book-card:hover {
  border-color: #6366f1; // theme primary color
  background: rgba(99, 102, 241, 0.06);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1);
}

.add-book-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  transition: all 0.3s ease;
}

.book-card.add-book-card:hover .add-book-icon {
  transform: scale(1.1);
  background: #6366f1;
  color: #ffffff;
}

.add-book-info h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--wabi-title, #3a3731);
  margin-bottom: 6px;
}

.add-book-info p {
  font-size: 12px;
  color: var(--wabi-text, #86827a);
  line-height: 1.5;
  margin: 0;
}

.image-board {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
  padding: 8px 0;
}

.image-card {
  position: relative;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  border: 1px solid var(--wabi-line, rgba(230, 225, 218, 0.8));
  border-radius: 8px;
  background: #faf9f6;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.08);
    border-color: #6366f1;

    .image-actions-overlay {
      opacity: 1;
    }
  }

  .image-preview {
    position: relative;
    aspect-ratio: 1;
    background: #f0ede4;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.5s ease;
    }

    &:hover img {
      transform: scale(1.05);
    }
  }

  h3 {
    margin: 8px 10px 4px;
    font-size: 14px;
    font-weight: 600;
    color: var(--wabi-title, #3a3731);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  p {
    margin: 0 10px 10px;
    font-size: 11px;
    color: var(--wabi-text, #86827a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.image-actions-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  opacity: 0;
  transition: opacity 0.25s ease;
  z-index: 2;

  .action-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.9);
    border: none;
    color: #333333;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);

    &:hover {
      transform: scale(1.1);
      background: #6366f1;
      color: #ffffff;
    }

    &.delete:hover {
      background: #ef4444;
      color: #ffffff;
    }
  }
}

.image-lightbox-dialog {
  background: transparent !important;
  box-shadow: none !important;

  .el-dialog__header {
    background: #ffffff;
    border-bottom: 1px solid var(--wabi-line, rgba(230, 225, 218, 0.8));
    margin: 0;
    padding: 16px 20px;
  }

  .el-dialog__body {
    padding: 20px;
    background: #faf8f5;
  }
}

.lightbox-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 80vh;
}

.lightbox-image-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111;
  border-radius: 8px;
  overflow: hidden;
  max-height: 60vh;

  img {
    max-width: 100%;
    max-height: 60vh;
    object-fit: contain;
  }
}

.lightbox-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--wabi-line, rgba(230, 225, 218, 0.8));
  padding-top: 14px;

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--wabi-title, #3a3731);
  }

  p {
    margin: 0;
    font-size: 13px;
    color: var(--wabi-text, #86827a);
  }

  .lightbox-actions {
    display: flex;
    gap: 10px;
  }
}

.images-grid {
  position: relative;
}

.image-drag-overlay {
  position: absolute;
  inset: 0;
  background: rgba(251, 250, 246, 0.85);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  pointer-events: none;

  .overlay-content {
    width: calc(100% - 40px);
    height: calc(100% - 40px);
    border: 3px dashed #6366f1;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #6366f1;
    background: rgba(99, 102, 241, 0.02);

    h3 {
      font-size: 18px;
      font-weight: 600;
      margin: 16px 0 8px;
    }

    p {
      font-size: 13px;
      color: var(--wabi-text, #86827a);
      margin: 0;
    }
  }
}
</style>
