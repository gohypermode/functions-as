import * as host from "./hypermode";
import { DQLResponse, DQLMutationResponse } from "./dqltypes";
import { GQLResponse } from "./gqltypes";
import { dql } from "./index";
import { JSON } from "json-as";

export abstract class graph {
    static buildJaccardSimilarityQuery(
      parentId: string,
      topK: u32,
      spec: JaccardSpec,
      onlyMoreChildren: bool = false,
    ): string {
      /*
        Create a DQL query to compute the Jaccard similarity between the set of children of a parent node 
        and the set of children of another parents node.
        The query Return the topK similar parent nodes ids.
  
        if onlyMoreChildren is true, the query will return only the similar nodes that have more children than the given node.
        
      */
      var diff = ''
      var filter = 'NOT uid(m1)'
      if (onlyMoreChildren) {
        diff = 'diff as math(m2-m1_norm)'
        filter = 'gt(val(diff),0)'
      }
      let query = `{
        var(func:eq(${spec.parentType}.${spec.parentIdField},"${parentId}")) {
         n as n:math(1.0)
         m1 as count(${spec.parentType}.${spec.parentChildPredicate} )
         ${spec.parentType}.${spec.parentChildPredicate} {
          ${spec.childType}.${spec.childParentPredicate}  {
                  m1_norm as math(m1/n)
                  intersect as math(n)
                  ${diff}
                  m2 as count(Thing.items)
                  r as math(1-n/(m2+m1_norm-n)) 
              }
        }
      }
      similarNodes(func:uid(r),orderasc:val(r),first:${topK}) @filter(${filter} ){
        id:${spec.parentType}.${spec.parentIdField}
        uid:uid
        union_size:math(m1_norm+m2-intersect)
        intersection_size:val(intersect)  
        jaccard_distance:val(r)
  
      }  
      }
    `
      return query
    }
    static buildJaccardRecoQuery( 
      /* get similar nodes with more children and return the additional children as recommendation
         score is the sum of jacard index (1 -distance) of parents leading to the child.
          
      */
      parentId: string,
      topK: u32,
      spec: JaccardSpec
    ): string {
      /*
        Create a DQL query to compute the Jaccard similarity between the set of children of a parent node 
        and the set of children of another parents node.
        The query Return the topK similar parent nodes ids.
  
        if onlyMoreChildren is true, the query will return only the similar nodes that have more children than the given node.
        
      */
   
      const diff = 'diff as math(m2-m1_norm)'
      const filter = 'gt(val(diff),0)'
      
      let query = `{
        var(func:eq(${spec.parentType}.${spec.parentIdField},"${parentId}")) {
         n as n:math(1.0)
         m1 as count(${spec.parentType}.${spec.parentChildPredicate} )
         items as ${spec.parentType}.${spec.parentChildPredicate} {
          ${spec.childType}.${spec.childParentPredicate}  {
                  m1_norm as math(m1/n)
                  ${diff}
                  m2 as count(Thing.items)
                  r as math(1-n/(m2+m1_norm-n)) 
              }
        }
      }
      var(func:uid(r),orderasc:val(r)) @filter(${filter} ){
        score as math(1-r)
        ${spec.parentType}.${spec.parentChildPredicate} @filter( NOT uid(items)) { item_score as math(score) }
      } 
      items(func:uid(item_score),orderdesc:val(item_score),first:${topK}) {
        id:${spec.childType}.${spec.childIdField}
        score:val(item_score)
        uid:uid
      } 
      }
    `
      return query
    }
    public static jaccardSimilarParents(
      parentId: string,
      topK: u32,
      spec: JaccardSpec,
      onlyMoreChildren: bool = false
    ): JaccardSimilarityNode[] {
      /*
        Create a DQL query to compute the Jaccard similarity between the set of children of a parent node 
        and the set of children of another parents node.
        The query Return the topK similar parent nodes ids.
      */
     
      let query = this.buildJaccardSimilarityQuery(parentId, topK, spec, onlyMoreChildren)
      console.log(query)
      const response =  dql.query<JaccardSimilarityResult>(query)
      return response.data.similarNodes
    }
    public static jaccardRecommendedItems(
      parentId: string,
      topK: u32,
      spec: JaccardSpec
    ): JaccardItemNode[] {
      /*
        Create a DQL query to compute the Jaccard similarity between the set of children of a parent node 
        and the set of children of another parents node.
        The query Return the topK similar parent nodes ids.
      */
     
      let query = this.buildJaccardRecoQuery(parentId, topK, spec)
      console.log(query)
      const response =  dql.query<JaccardRecommandationResult>(query)
      return response.data.items
    }
  }
  
  
  

  
  

  @json
  export class JaccardSpec {
    parentType!: string;
    childType!: string;
    parentIdField!: string;
    childIdField!: string;
    parentChildPredicate!: string;
    childParentPredicate!: string;
  }
  
  @json
  export class JaccardSimilarityResult {
    similarNodes!: JaccardSimilarityNode[]
  }
  
  @json
  export class JaccardSimilarityNode{
    id!: string;
    uid!: string;
    jaccard_distance!: f32;
    union_size!: f32;
    intersection_size!: f32;
  }
  @json
  export class JaccardRecommandationResult {
    items!: JaccardItemNode[]
  }
  @json
  export class JaccardItemNode{
    id!: string;
    uid!: string;
    score!: f32;
  }
  