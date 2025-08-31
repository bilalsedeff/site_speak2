import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Site, CreateSiteRequest, UpdateSiteRequest } from '@shared/types'
import { sitesApi } from '@/services/api'

interface SitesState {
  sites: Site[]
  currentSite: Site | null
  isLoading: boolean
  error: string | null
  searchQuery: string
  filterStatus: 'all' | 'draft' | 'published' | 'archived'
  sortBy: 'name' | 'createdAt' | 'updatedAt'
  sortOrder: 'asc' | 'desc'
}

const initialState: SitesState = {
  sites: [],
  currentSite: null,
  isLoading: false,
  error: null,
  searchQuery: '',
  filterStatus: 'all',
  sortBy: 'updatedAt',
  sortOrder: 'desc',
}

// Async thunks
export const fetchSites = createAsyncThunk(
  'sites/fetchSites',
  async (_, { rejectWithValue }) => {
    try {
      const sites = await sitesApi.getAllSites()
      return sites
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch sites')
    }
  }
)

export const fetchSite = createAsyncThunk(
  'sites/fetchSite',
  async (siteId: string, { rejectWithValue }) => {
    try {
      const site = await sitesApi.getSite(siteId)
      return site
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch site')
    }
  }
)

export const createSite = createAsyncThunk(
  'sites/createSite',
  async (siteData: CreateSiteRequest, { rejectWithValue }) => {
    try {
      const site = await sitesApi.createSite(siteData)
      return site
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to create site')
    }
  }
)

export const updateSite = createAsyncThunk(
  'sites/updateSite',
  async ({ siteId, data }: { siteId: string; data: UpdateSiteRequest }, { rejectWithValue }) => {
    try {
      const site = await sitesApi.updateSite(siteId, data)
      return site
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update site')
    }
  }
)

export const deleteSite = createAsyncThunk(
  'sites/deleteSite',
  async (siteId: string, { rejectWithValue }) => {
    try {
      await sitesApi.deleteSite(siteId)
      return siteId
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to delete site')
    }
  }
)

export const publishSite = createAsyncThunk(
  'sites/publishSite',
  async (siteId: string, { rejectWithValue }) => {
    try {
      const result = await sitesApi.publishSite(siteId)
      return { siteId, ...result }
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to publish site')
    }
  }
)

const sitesSlice = createSlice({
  name: 'sites',
  initialState,
  reducers: {
    setCurrentSite: (state, action: PayloadAction<Site | null>) => {
      state.currentSite = action.payload
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload
    },
    setFilterStatus: (state, action: PayloadAction<typeof initialState.filterStatus>) => {
      state.filterStatus = action.payload
    },
    setSorting: (state, action: PayloadAction<{ sortBy: typeof initialState.sortBy; sortOrder: typeof initialState.sortOrder }>) => {
      state.sortBy = action.payload.sortBy
      state.sortOrder = action.payload.sortOrder
    },
    clearError: (state) => {
      state.error = null
    },
    // Optimistic updates for real-time editing
    updateSiteLocally: (state, action: PayloadAction<Partial<Site> & { id: string }>) => {
      const index = state.sites.findIndex(site => site.id === action.payload.id)
      if (index !== -1) {
        state.sites[index] = { ...state.sites[index], ...action.payload }
      }
      if (state.currentSite?.id === action.payload.id) {
        state.currentSite = { ...state.currentSite, ...action.payload }
      }
    },
  },
  extraReducers: (builder) => {
    // Fetch sites
    builder
      .addCase(fetchSites.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchSites.fulfilled, (state, action) => {
        state.isLoading = false
        state.sites = action.payload
        state.error = null
      })
      .addCase(fetchSites.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })

    // Fetch single site
    builder
      .addCase(fetchSite.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchSite.fulfilled, (state, action) => {
        state.isLoading = false
        state.currentSite = action.payload
        
        // Update in sites array if exists
        const index = state.sites.findIndex(site => site.id === action.payload.id)
        if (index !== -1) {
          state.sites[index] = action.payload
        }
        
        state.error = null
      })
      .addCase(fetchSite.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })

    // Create site
    builder
      .addCase(createSite.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(createSite.fulfilled, (state, action) => {
        state.isLoading = false
        state.sites.unshift(action.payload)
        state.currentSite = action.payload
        state.error = null
      })
      .addCase(createSite.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })

    // Update site
    builder
      .addCase(updateSite.fulfilled, (state, action) => {
        const index = state.sites.findIndex(site => site.id === action.payload.id)
        if (index !== -1) {
          state.sites[index] = action.payload
        }
        if (state.currentSite?.id === action.payload.id) {
          state.currentSite = action.payload
        }
      })
      .addCase(updateSite.rejected, (state, action) => {
        state.error = action.payload as string
      })

    // Delete site
    builder
      .addCase(deleteSite.fulfilled, (state, action) => {
        state.sites = state.sites.filter(site => site.id !== action.payload)
        if (state.currentSite?.id === action.payload) {
          state.currentSite = null
        }
      })
      .addCase(deleteSite.rejected, (state, action) => {
        state.error = action.payload as string
      })

    // Publish site
    builder
      .addCase(publishSite.pending, (state) => {
        state.isLoading = true
      })
      .addCase(publishSite.fulfilled, (state, action) => {
        state.isLoading = false
        const index = state.sites.findIndex(site => site.id === action.payload.siteId)
        if (index !== -1) {
          state.sites[index] = { 
            ...state.sites[index], 
            status: 'published',
            publishedAt: new Date().toISOString(),
            publishedUrl: action.payload.publishedUrl 
          }
        }
        if (state.currentSite?.id === action.payload.siteId) {
          state.currentSite = {
            ...state.currentSite,
            status: 'published',
            publishedAt: new Date().toISOString(),
            publishedUrl: action.payload.publishedUrl
          }
        }
      })
      .addCase(publishSite.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
  },
})

export const { 
  setCurrentSite, 
  setSearchQuery, 
  setFilterStatus, 
  setSorting, 
  clearError,
  updateSiteLocally 
} = sitesSlice.actions

export default sitesSlice.reducer